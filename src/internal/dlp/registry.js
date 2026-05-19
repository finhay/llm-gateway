import email from "./detectors/email.js";
import phone from "./detectors/phone.js";
import nationalId from "./detectors/nationalId.js";
import creditCard from "./detectors/creditCard.js";
import bankAccount from "./detectors/bankAccount.js";
import { buildCustomDetectors } from "./detectors/customRegex.js";

export const DETECTORS = [creditCard, nationalId, bankAccount, email, phone];

export function getDlpDetectors(customPatterns = []) {
  return [...DETECTORS, ...buildCustomDetectors(customPatterns)];
}
