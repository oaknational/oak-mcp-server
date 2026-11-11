type StringKeyOf<T> = Extract<keyof T, string>;
type ValueOf<T> = T[StringKeyOf<T>];
type EntryOf<T> = [StringKeyOf<T>, ValueOf<T>];

function isOwnStringKey<T>(obj: T, key: string): key is StringKeyOf<T> {
  return Object.hasOwn(Object(obj) as object, key);
}

function typeSafeKeys<T>(obj: T): StringKeyOf<T>[] {
  const keys: StringKeyOf<T>[] = [];

  for (const key in Object(obj) as object) {
    if (isOwnStringKey(obj, key)) {
      keys.push(key);
    }
  }

  return keys;
}

export function typeSafeValues<T>(obj: T): ValueOf<T>[] {
  const values: ValueOf<T>[] = [];

  for (const key of typeSafeKeys(obj)) {
    values.push(obj[key]);
  }

  return values;
}

export function typeSafeEntries<T>(obj: T): EntryOf<T>[] {
  const entries: EntryOf<T>[] = [];

  for (const key of typeSafeKeys(obj)) {
    const entry: EntryOf<T> = [key, obj[key]];
    entries.push(entry);
  }

  return entries;
}
