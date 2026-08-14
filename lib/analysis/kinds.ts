/**
 * Derived output kinds, kept separate from the generator that uses them.
 *
 * The results screen needs these labels, and the generator imports the AI SDK.
 * Sharing one module would pull the whole SDK into the client bundle for the
 * sake of three strings, so the constants live here and `derive.ts` reads them.
 */
export type DerivativeKind = 'email' | 'social_post' | 'training_handout';

export const DERIVATIVE_KINDS: {
  value: DerivativeKind;
  label: string;
  description: string;
  titleLabel: string;
}[] = [
  {
    value: 'email',
    label: 'Email',
    description: 'A short email sending the recap to a team or a client.',
    titleLabel: 'SUBJECT',
  },
  {
    value: 'social_post',
    label: 'Social post',
    description: 'A LinkedIn-length post plus a shorter variant.',
    titleLabel: 'HOOK',
  },
  {
    value: 'training_handout',
    label: 'Training handout',
    description: 'A one-page handout for teaching this material.',
    titleLabel: 'TITLE',
  },
];
