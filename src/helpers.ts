export function stringToSet(str: string): Set<string> {
    if (!str) {
      return new Set();
    }
    return new Set(
      str
        .split(/[,，]/)
        .map((item) => item.trim()) // remove space
        .filter((item) => item.length > 0) // remove empty string
    );
  }