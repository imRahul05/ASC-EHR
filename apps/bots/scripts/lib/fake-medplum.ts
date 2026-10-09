// Test helper: an in-memory stand-in for the Medplum client, just the calls the seed makes.

export type Resource = { resourceType: string; id?: string; [key: string]: unknown };

/** An in-memory stand-in for the Medplum client: just the calls the seed makes. */
export function fakeMedplum(initial: Resource[] = []) {
  const store: Resource[] = [...initial];
  let counter = 0;
  const posts: string[] = [];
  const invites: Record<string, unknown>[] = [];
  const withId = (resource: Resource): Resource => ({ ...resource, id: resource.id ?? `id-${++counter}` });

  /** Medplum's invite: reuses the Practitioner with the same email, refuses a second membership. */
  function invite(body: Record<string, unknown>): Resource {
    invites.push(body);
    const email = body.email;
    const found = store.find(
      (candidate) =>
        candidate.resourceType === "Practitioner" &&
        (candidate.telecom as { value: string }[] | undefined)?.some((telecom) => telecom.value === email),
    );
    const practitioner = found ?? withId({ resourceType: "Practitioner", telecom: [{ system: "email", value: email }] });
    if (found === undefined) store.push(practitioner);
    const profile = `Practitioner/${practitioner.id}`;
    if (store.some((candidate) => candidate.resourceType === "ProjectMembership" && (candidate.profile as { reference: string }).reference === profile)) {
      throw new Error("User is already a member of this project");
    }
    const membership = withId({
      resourceType: "ProjectMembership",
      user: { reference: `User/${practitioner.id}` },
      profile: { reference: profile },
      access: (body.membership as { access?: unknown } | undefined)?.access,
    });
    store.push(membership);
    return membership;
  }

  const medplum = {
    createResourceIfNoneExist: (resource: Resource, query: string) => {
      const value = query.split("|")[1];
      const found = store.find(
        (candidate) =>
          candidate.resourceType === resource.resourceType &&
          (candidate.identifier as { value: string }[] | undefined)?.some((identifier) => identifier.value === value),
      );
      if (found) return Promise.resolve(found);
      const created = withId(resource);
      store.push(created);
      return Promise.resolve(created);
    },
    createResource: (resource: Resource) => {
      const created = withId(resource);
      store.push(created);
      return Promise.resolve(created);
    },
    updateResource: (resource: Resource) => {
      const index = store.findIndex((candidate) => candidate.id === resource.id);
      store[index] = resource;
      return Promise.resolve(resource);
    },
    searchResources: (type: string, query: Record<string, string>) =>
      Promise.resolve(
        store.filter((candidate) => {
          if (candidate.resourceType !== type) return false;
          if (query["name:exact"] !== undefined) return candidate.name === query["name:exact"];
          if (query.user !== undefined) return (candidate.user as { reference: string } | undefined)?.reference === query.user;
          if (query.profile !== undefined) return (candidate.profile as { reference: string } | undefined)?.reference === query.profile;
          return true;
        }),
      ),
    deleteResource: (type: string, id: string) => {
      const index = store.findIndex((candidate) => candidate.resourceType === type && candidate.id === id);
      if (index === -1) return Promise.reject(new Error("Not found"));
      store.splice(index, 1);
      return Promise.resolve();
    },
    readResource: (type: string, id: string) => {
      const found = store.find((candidate) => candidate.resourceType === type && candidate.id === id);
      return found === undefined ? Promise.reject(new Error("Not found")) : Promise.resolve(found);
    },
    fhirUrl: (...parts: string[]) => new URL(parts.join("/"), "http://fake.test/fhir/R4/"),
    post: (url: URL | string, body: unknown) => {
      posts.push(String(url));
      if (String(url).endsWith("/invite")) return Promise.resolve(invite(body as Record<string, unknown>));
      const created = withId({ resourceType: "Project", name: (body as { parameter: { valueString: string }[] }).parameter[0]?.valueString });
      store.push(created);
      return Promise.resolve(created);
    },
  };
  return { medplum: medplum as never, store, posts, invites };
}
