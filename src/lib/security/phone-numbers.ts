import { ELACHEE } from "@/lib/config";

const PHONE_NUMBER_PATTERN =
  /(?:\+?1[\s().-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

function nationalDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
}

export function containsNonElacheePhoneNumber(value: string): boolean {
  const approvedDigits = nationalDigits(ELACHEE.contact.phone);
  return [...value.matchAll(PHONE_NUMBER_PATTERN)].some(
    (match) => nationalDigits(match[0] ?? "") !== approvedDigits,
  );
}

export function redactNonElacheePhoneNumbers(value: string): string {
  const approvedDigits = nationalDigits(ELACHEE.contact.phone);
  return value.replace(PHONE_NUMBER_PATTERN, (match) =>
    nationalDigits(match) === approvedDigits ? match : "[phone number omitted]",
  );
}
