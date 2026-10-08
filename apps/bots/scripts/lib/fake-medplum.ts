// Test helper: an in-memory stand-in for the Medplum client, just the calls the seed makes.

export type Resource = { resourceType: string; id?: string; [key: string]: unknown };

/** An in-memory stand-in for the Medplum client: just the calls the seed makes. */
export function fakeMedplum(initial: Resource[] = []) {
  const store: Resource[] = [...initial];
  let counter = 0;
  const posts: string[] = [];
  const withId = (resource: Resource): Resource => ({ ...resource, id: resource.id ?? `id-${++counter}` });

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
          return true;
        }),
      ),
    fhirUrl: (...parts: string[]) => new URL(parts.join("/"), "http://fake.test/fhir/R4/"),
    post: (url: URL | string, body: unknown) => {
      posts.push(String(url));
      const created = withId({ resourceType: "Project", name: (body as { parameter: { valueString: string }[] }).parameter[0]?.valueString });
      store.push(created);
      return Promise.resolve(created);
    },
  };
  return { medplum: medplum as never, store, posts };
}
