"use client";

import { useState, type FormEvent } from "react";
import { useAddImage, useAddSpecimen } from "@asc/api-client/react";
import { ANATOMIC_SITE_LABEL, COLON_SITES, REMOVAL_METHOD_LABEL, UPPER_GI_SITES } from "@asc/clinical-rules";
import type { AnatomicSite, CaseDetail, RemovalMethod } from "@asc/types";
import { Button, Checkbox, FormField, Input, Label, OptionSelect, SegmentedControl, toast } from "@asc/ui";
import { LoaderCircle, Plus } from "@asc/ui/icons";
import { notifyError } from "../notify-error";
import { SpecimenLabel } from "./specimen-label";

interface AddSpecimenFormProps {
  readonly detail: CaseDetail;
  readonly onDone: () => void;
}

interface SpecimenForm {
  readonly site: AnatomicSite | null;
  readonly size: string;
  readonly method: RemovalMethod;
  readonly description: string;
  readonly linkImage: boolean;
}

const JARS = "ABCDEFGHIJ";
const METHODS = Object.keys(REMOVAL_METHOD_LABEL) as RemovalMethod[];
const METHOD_OPTIONS = METHODS.map((value) => ({ value, label: REMOVAL_METHOD_LABEL[value] }));
const MAX_SIZE_MM = 60;
const ROOM_SEGMENTS = "[&>button]:min-h-12 [&>button]:text-base";

const INITIAL: SpecimenForm = { site: null, size: "", method: "cold_snare", description: "Sessile polyp", linkImage: true };

/** New specimen jar: site, size (mm), removal method → live label preview; optionally captures a linked polyp image. */
export function AddSpecimenForm({ detail, onDone }: AddSpecimenFormProps) {
  const [form, setForm] = useState<SpecimenForm>(INITIAL);
  const addSpecimen = useAddSpecimen(detail.case.id);
  const addImage = useAddImage(detail.case.id);
  const sites = detail.case.procedure === "EGD" ? UPPER_GI_SITES : COLON_SITES;
  const siteOptions = sites.map((value) => ({ value, label: ANATOMIC_SITE_LABEL[value] }));
  const sizeMm = Number(form.size);
  const sizeValid = form.size === "" || (Number.isFinite(sizeMm) && sizeMm > 0 && sizeMm <= MAX_SIZE_MM);
  const jar = JARS[detail.specimens.length] ?? String(detail.specimens.length + 1);
  const update = (patch: Partial<SpecimenForm>) => setForm((current) => ({ ...current, ...patch }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { site } = form;
    if (!site || !sizeValid) return;
    addSpecimen.mutate(
      { site, description: form.description.trim() || "Polyp", removalMethod: form.method, ...(form.size ? { sizeMm } : {}) },
      {
        onSuccess: (updated) => {
          const specimen = updated.specimens.at(-1);
          toast.success(`Jar ${specimen?.jar ?? jar} logged`);
          if (form.linkImage && specimen) {
            addImage.mutate(
              { site, caption: `Polyp before resection (jar ${specimen.jar})`, specimenId: specimen.id },
              { onError: notifyError("Image was not captured") },
            );
          }
          setForm(INITIAL);
          onDone();
        },
        onError: notifyError("Could not log the specimen"),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-muted/30 p-4" data-testid="procedure-specimen-form">
      <div className="grid gap-4 @xl:grid-cols-2">
        <FormField id="specimen-site" label="Site / segment">
          <OptionSelect
            id="specimen-site"
            options={siteOptions}
            value={form.site}
            onValueChange={(site) => update({ site })}
            placeholder="Choose site…"
            className="data-[size=default]:h-12 text-base"
            data-testid="procedure-specimen-site"
          />
        </FormField>
        <FormField id="specimen-size" label="Size (mm)" error={sizeValid ? undefined : `Enter 1–${MAX_SIZE_MM} mm`}>
          <Input
            id="specimen-size"
            inputMode="decimal"
            value={form.size}
            onChange={(event) => update({ size: event.target.value })}
            placeholder="e.g. 6"
            aria-invalid={!sizeValid || undefined}
            className="h-12 text-base tabular-nums"
            data-testid="procedure-specimen-size"
          />
        </FormField>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium" id="specimen-method-label">
          Removal method
        </p>
        <SegmentedControl
          options={METHOD_OPTIONS}
          value={form.method}
          onValueChange={(method) => update({ method })}
          aria-label="Removal method"
          className={ROOM_SEGMENTS}
          data-testid="procedure-specimen-method"
        />
      </div>
      <FormField id="specimen-description" label="Description">
        <Input
          id="specimen-description"
          value={form.description}
          onChange={(event) => update({ description: event.target.value })}
          className="h-12 text-base"
          data-testid="procedure-specimen-description"
        />
      </FormField>
      <div className="flex items-center gap-2">
        <Checkbox
          id="specimen-link-image"
          checked={form.linkImage}
          onCheckedChange={(linkImage) => update({ linkImage })}
          className="size-5"
        />
        <Label htmlFor="specimen-link-image" className="text-sm">
          Capture a polyp image and link it to this jar
        </Label>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Label preview</p>
        <SpecimenLabel
          preview
          jar={jar}
          patient={detail.case.patient}
          caseNumber={detail.case.caseNumber}
          site={form.site}
          sizeMm={form.size && sizeValid ? sizeMm : undefined}
          removalMethod={form.method}
          description={form.description}
          data-testid="procedure-specimen-preview"
        />
        {!form.size && <p className="text-sm text-warning">Without a size the note will raise a blocking gap.</p>}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="lg" className="h-12" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="lg"
          className="h-12 text-base"
          disabled={!form.site || !sizeValid || addSpecimen.isPending}
          data-testid="procedure-specimen-save"
        >
          {addSpecimen.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}
          Log jar {jar}
        </Button>
      </div>
    </form>
  );
}
