type StringKeyOf<T> = Extract<keyof T, string>;
type ValueOf<T> = T[StringKeyOf<T>];
type EntryOf<T> = [StringKeyOf<T>, ValueOf<T>];

function isOwnStringKey<T>(obj: T, key: string): key is StringKeyOf<T> {
  return Object.hasOwn(Object(obj) as object, key);
}

export function typeSafeKeys<T>(obj: T): StringKeyOf<T>[] {
  const keys: StringKeyOf<T>[] = [];

  for (const key in Object(obj) as object) {
    if (isOwnStringKey(obj, key)) {
      keys.push(key);
    }
  }

  return keys;
}

export function typeSafeEntries<T>(obj: T): EntryOf<T>[] {
  const entries: EntryOf<T>[] = [];

  for (const key of typeSafeKeys(obj)) {
    const entry: EntryOf<T> = [key, obj[key]];
    entries.push(entry);
  }

  return entries;
}
