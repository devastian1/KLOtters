# Security Specification — LutraKL (Kuala Lumpur River Otter Watch)

## 1. Data Invariants
1. **Identity Integrity**: Every sighting, confirmation, and comment MUST carry an `authorId` (or `userId`) strictly matching `request.auth.uid` with `request.auth.token.email_verified == true`.
2. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps MUST equal `request.time`. `createdAt` is immutable on update.
3. **Geographic Bounds**: Coordinates `lat` and `lng` are bounded to the Greater Kuala Lumpur / Klang Valley region (`lat` in `[2.75, 3.55]`, `lng` in `[101.30, 102.00]`).
4. **Payload Size & Photo Safety**: Photo strings are bounded to `<= 350000` characters and strictly limited to `/src/assets/images/*.jpg` or base64 `data:image/(jpeg|png|webp);base64,...`.
5. **Atomic Confirmations**: Incrementing `sightings/{sightingId}.confirmations` by `+1` MUST happen atomically in the same batch as creating `/sightings/{sightingId}/confirmations/{request.auth.uid}` and is prevented if the user already confirmed.
6. **PII Isolation**: No email addresses, phone numbers, or private user PII are stored in public sighting or comment documents.

## 2. Dirty Dozen Adversarial Payloads
1. **Unauthenticated Create**: Create a sighting with `request.auth == null`. -> `PERMISSION_DENIED`
2. **Unverified Email Create**: Create a sighting with `email_verified: false`. -> `PERMISSION_DENIED`
3. **Author Spoofing**: User A attempts to create a sighting with `authorId: "user_B"`. -> `PERMISSION_DENIED`
4. **Shadow / Ghost Field Injection**: Create a sighting with extra key `isOfficialVerified: true`. -> `PERMISSION_DENIED`
5. **Initial Confirmations Tampering**: Create a sighting with `confirmations: 500` instead of `0`. -> `PERMISSION_DENIED`
6. **Out-of-Bounds Coordinate Poisoning**: Create a sighting with `lat: 51.5, lng: -0.1` (outside Klang Valley). -> `PERMISSION_DENIED`
7. **Timestamp Forgery**: Create a sighting with a backdated `createdAt` not equal to `request.time`. -> `PERMISSION_DENIED`
8. **Malicious Photo URI / XSS**: Create a sighting with `photoUrl: "javascript:alert(1)"` or >350KB payload. -> `PERMISSION_DENIED`
9. **Non-Author Edit**: User B tries to edit `title` or `notes` on User A's sighting. -> `PERMISSION_DENIED`
10. **Non-Atomic Confirmation Boost**: User B increments `confirmations` by `+10` without creating `/confirmations/{uid}`. -> `PERMISSION_DENIED`
11. **Duplicate Confirmation**: User B creates a second confirmation or updates `confirmations` again after already confirming. -> `PERMISSION_DENIED`
12. **Path Variable Poisoning**: Create a document with an oversized or non-alphanumeric ID (`../../admin` or >128 chars). -> `PERMISSION_DENIED`
