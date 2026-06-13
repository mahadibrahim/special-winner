/** Pure unit-conversion + BMI helpers for the Drop League. UI uses natural
 *  units (ft/in, lbs); storage uses metric base units (cm, grams). Convert at
 *  the API boundary. */
const LB_TO_G = 453.59237;

export const lbsToGrams = (lbs: number): number => Math.round(lbs * LB_TO_G);

export const feetInchesToCm = (feet: number, inches: number): number =>
  Math.round((feet * 12 + inches) * 2.54);

/** BMI = kg / m^2, rounded to one decimal. */
export const computeBmi = (weightG: number, heightCm: number): number => {
  const kg = weightG / 1000;
  const m = heightCm / 100;
  if (m <= 0) return 0;
  return Math.round((kg / (m * m)) * 10) / 10;
};

export const ELIGIBLE_BMI_MIN = 27.5;

export const isEligibleBmi = (bmi: number): boolean => bmi >= ELIGIBLE_BMI_MIN;
