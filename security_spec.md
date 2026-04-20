# Firestore Security Specification

## Data Invariants
1. `users/{userId}`: A user can only manage their own profile.
2. `user_data/{userId}`: Comprehensive application state. A user can only access and modify their own data.
3. Timestamps: `updatedAt` must be strictly validated on updates.
4. Identity: The `uid` field in documents must match the authenticated user's ID.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing (Create)**: Attempting to create a user profile with a different UID.
2. **Identity Spoofing (Update)**: Attempting to update another user's profile.
3. **Data Hijacking (List)**: Authenticated user attempting to list all `user_data` documents.
4. **Data Hijacking (Get)**: Authenticated user attempting to get another user's `user_data`.
5. **Schema Poisoning**: Writing `user_data` with a 1MB junk string in a critical field.
6. **State Skip**: Manually updating a terminal status (not applicable here yet, but good practice).
7. **Timestamp Fraud**: Providing a future `updatedAt` instead of `request.time`.
8. **Shadow Field Injection**: Adding an `isAdmin` field to a user profile.
9. **Orphaned Writes**: Creating `user_data` without a matching `users` profile (optional, but good).
10. **Unauthenticated Write**: Attempting to create a profile without being logged in.
11. **Malicious ID**: Using a 1KB string as a document ID to bloat index costs.
12. **PII Leak**: An unauthenticated user attempting to 'get' a user profile.

## The Test Runner
A test suite will be created in `src/tests/firestore.rules.test.ts` to verify these protections.
