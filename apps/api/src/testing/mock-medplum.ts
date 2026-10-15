import { ClientStorage, MemoryStorage, ReadablePromise, type WithId } from "@medplum/core";
import type {
  Appointment,
  Bundle,
  Encounter,
  ExtractResource,
  Practitioner,
  Reference,
  ResourceType,
} from "@medplum/fhirtypes";
import { MockClient as BaseMockClient } from "@medplum/mock";

type MedplumQuery = Parameters<BaseMockClient["search"]>[1];
type MedplumOptions = Parameters<BaseMockClient["search"]>[2];

/**
 * Shared mock Medplum client for scheduling and cases testing.
 * Adds in-memory search filtering for dates, date-ranges, accounts, appointments, and identifiers,
 * which BaseMockClient does not parse in array-of-arrays or query object formats.
 */
export class CasesMockClient extends BaseMockClient {
  constructor() {
    super({ storage: new ClientStorage(new MemoryStorage()) });
  }

  override readResource<RT extends ResourceType>(
    resourceType: RT,
    id: string,
  ): ReadablePromise<WithId<ExtractResource<RT>>> {
    if (resourceType === "Patient") {
      if (id.startsWith("forbidden")) {
        return new ReadablePromise(
          Promise.reject(Object.assign(new Error("Access forbidden"), { status: 403 })),
        );
      }
      if (id.startsWith("unavailable")) {
        return new ReadablePromise(
          Promise.reject(Object.assign(new Error("Connection timeout"), { status: 503 })),
        );
      }
    }
    if (resourceType === "Practitioner") {
      if (id.startsWith("inactive")) {
        return new ReadablePromise(
          super.readResource(resourceType, id).catch(() => {
            const prac: Practitioner = {
              resourceType: "Practitioner",
              id,
              name: [{ family: id, given: ["Doctor"] }],
              active: false,
            };
            return prac as WithId<ExtractResource<RT>>;
          }),
        );
      }
      if (!id.startsWith("nonexistent") && !id.startsWith("bad-")) {
        return new ReadablePromise(
          super.readResource(resourceType, id).catch(() => {
            const prac: Practitioner = {
              resourceType: "Practitioner",
              id,
              name: [{ family: id, given: ["Doctor"] }],
              active: true,
            };
            return prac as WithId<ExtractResource<RT>>;
          }),
        );
      }
    }
    return super.readResource(resourceType, id);
  }

  override search<RT extends ResourceType>(
    resourceType: RT,
    query?: MedplumQuery,
    options?: MedplumOptions,
  ): ReadablePromise<Bundle<WithId<ExtractResource<RT>>>> {
    let accountFilter: string | undefined;
    let appointmentFilter: string | undefined;
    let subjectFilter: string | undefined;
    let patientFilter: string | undefined;
    let encounterFilter: string | undefined;
    let identifierFilter: string | undefined;
    let idFilter: string | undefined;
    let countFilter: number | undefined;
    let dateFilter: string | undefined;
    let dateRangeFilter: { ge?: number; le?: number } | undefined;
    let cleanQuery = query;
    if (Array.isArray(query)) {
      let ge: number | undefined;
      let le: number | undefined;
      const cleanArray: string[][] = [];
      for (const entry of query) {
        if (Array.isArray(entry) && entry[0] === "date" && typeof entry[1] === "string") {
          const val = entry[1];
          if (val.startsWith("ge")) ge = Date.parse(val.slice(2));
          if (val.startsWith("le")) le = Date.parse(val.slice(2));
        } else if (Array.isArray(entry) && entry[0] === "_account" && typeof entry[1] === "string") {
          accountFilter = entry[1];
        } else if (Array.isArray(entry) && entry[0] === "appointment" && typeof entry[1] === "string") {
          appointmentFilter = entry[1];
        } else if (Array.isArray(entry) && entry[0] === "subject" && typeof entry[1] === "string") {
          subjectFilter = entry[1];
        } else if (Array.isArray(entry) && (entry[0] === "patient" || entry[0] === "beneficiary") && typeof entry[1] === "string") {
          patientFilter = entry[1];
        } else if (Array.isArray(entry) && entry[0] === "encounter" && typeof entry[1] === "string") {
          encounterFilter = entry[1];
        } else if (Array.isArray(entry) && entry[0] === "identifier" && typeof entry[1] === "string") {
          identifierFilter = entry[1];
        } else if (Array.isArray(entry) && (entry[0] === "_id" || entry[0] === "id") && typeof entry[1] === "string") {
          idFilter = entry[1];
        } else if (Array.isArray(entry) && entry[0] === "_count" && typeof entry[1] === "string") {
          countFilter = Number.parseInt(entry[1], 10);
        } else if (Array.isArray(entry)) {
          cleanArray.push(entry);
        }
      }
      if (ge !== undefined || le !== undefined) {
        dateRangeFilter = { ge, le };
      }
      cleanQuery = cleanArray;
    } else if (
      query !== undefined &&
      typeof query === "object" &&
      !(query instanceof URLSearchParams) &&
      !("resourceType" in query)
    ) {
      const copy: Record<string, string | number | boolean | undefined> = { ...query };
      const rawAccount = copy["_account"];
      if (typeof rawAccount === "string") {
        accountFilter = rawAccount;
        delete copy["_account"];
      }
      const rawDate = copy["date"];
      if (typeof rawDate === "string") {
        dateFilter = rawDate;
        delete copy["date"];
      }
      const rawSubject = copy["subject"];
      if (typeof rawSubject === "string") {
        subjectFilter = rawSubject;
        delete copy["subject"];
      }
      const rawPatient = copy["patient"] ?? copy["beneficiary"];
      if (typeof rawPatient === "string") {
        patientFilter = rawPatient;
        delete copy["patient"];
        delete copy["beneficiary"];
      }
      const rawEncounter = copy["encounter"];
      if (typeof rawEncounter === "string") {
        encounterFilter = rawEncounter;
        delete copy["encounter"];
      }
      const rawIdentifier = copy["identifier"];
      if (typeof rawIdentifier === "string") {
        identifierFilter = rawIdentifier;
        delete copy["identifier"];
      }
      const rawId = copy["_id"] ?? copy["id"];
      if (typeof rawId === "string") {
        idFilter = rawId;
        delete copy["_id"];
        delete copy["id"];
      }
      const rawCount = copy["_count"];
      if (typeof rawCount === "string" || typeof rawCount === "number") {
        countFilter = typeof rawCount === "string" ? Number.parseInt(rawCount, 10) : rawCount;
        delete copy["_count"];
      }
      cleanQuery = copy;
    }

    const bundlePromise = super.search(resourceType, cleanQuery, options).then((bundle) => {
      let filteredEntries = bundle.entry;
      if (accountFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) => {
          const enc = e.resource as Encounter | undefined;
          return (
            e.resource?.meta?.accounts?.some((a) => a.reference === accountFilter) ||
            enc?.serviceProvider?.reference === accountFilter
          );
        });
      }
      if (dateFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) => {
          const appItem = e.resource as Appointment | undefined;
          const encItem = e.resource as Encounter | undefined;
          const startIso = appItem?.start ?? encItem?.period?.start;
          return startIso?.startsWith(dateFilter);
        });
      }
      if (dateRangeFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) => {
          const appItem = e.resource as Appointment | undefined;
          const encItem = e.resource as Encounter | undefined;
          const startIso = appItem?.start ?? encItem?.period?.start;
          if (!startIso) return false;
          const startMs = Date.parse(startIso);
          if (dateRangeFilter?.ge !== undefined && startMs < dateRangeFilter.ge) return false;
          if (dateRangeFilter?.le !== undefined && startMs > dateRangeFilter.le) return false;
          return true;
        });
      }
      if (appointmentFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) => {
          const enc = e.resource as Encounter | undefined;
          return enc?.appointment?.some((a: Reference) => a.reference === appointmentFilter);
        });
      }
      if (subjectFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) => {
          const enc = e.resource as Encounter | undefined;
          return enc?.subject?.reference === subjectFilter;
        });
      }
      if (patientFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) => {
          const res = e.resource as { patient?: Reference; subject?: Reference; beneficiary?: Reference } | undefined;
          return (
            res?.patient?.reference === patientFilter ||
            res?.subject?.reference === patientFilter ||
            res?.beneficiary?.reference === patientFilter
          );
        });
      }
      if (encounterFilter !== undefined) {
        filteredEntries = filteredEntries?.filter((e) => {
          const res = e.resource as { encounter?: Reference } | undefined;
          return res?.encounter?.reference === encounterFilter;
        });
      }
      if (identifierFilter !== undefined) {
        const [targetSystem, targetValue] = identifierFilter.includes("|")
          ? identifierFilter.split("|")
          : [undefined, identifierFilter];
        filteredEntries = filteredEntries?.filter((e) => {
          const res = e.resource as { identifier?: Array<{ system?: string; value?: string }> } | undefined;
          return res?.identifier?.some((id) =>
            targetSystem !== undefined
              ? id.system === targetSystem && id.value === targetValue
              : id.value === targetValue,
          );
        });
      }
      if (idFilter !== undefined) {
        const targetIds = new Set(idFilter.split(","));
        filteredEntries = filteredEntries?.filter((e) => e.resource?.id && targetIds.has(e.resource.id));
      }
      if (countFilter !== undefined && filteredEntries !== undefined) {
        filteredEntries = filteredEntries.slice(0, countFilter);
      }
      return {
        ...bundle,
        total: filteredEntries?.length ?? 0,
        entry: filteredEntries !== undefined && filteredEntries.length > 0 ? filteredEntries : undefined,
      };
    });
    return new ReadablePromise(bundlePromise);
  }
}
