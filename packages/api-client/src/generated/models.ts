// Generated from openapi.json. Do not edit.
export interface RegisterDto {
  email: string;
  displayName: string;
  password: string;
  platform: 'native' | 'web';
}

export interface RegistrationAcceptedDto {
  code: 'REGISTRATION_ACCEPTED';
  /** Native-only pending proof. Web responses omit this property. */
  pendingProof?: string;
}
