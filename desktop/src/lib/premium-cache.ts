export function getIsPremium(): boolean {
  return true;
}

export function setIsPremium(_value: boolean): void {}

export function usePremium(): boolean {
  return true;
}

export function setPremiumRecheckHandler(_fn: () => void): void {}

export function requestPremiumRecheck(): void {}
