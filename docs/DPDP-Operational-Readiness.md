# NHYM 2026 — DPDP Operational Readiness Checklist

**Internal operational document for the NHYM 2026 Local Organizing Committee (LOC)**  
**Prepared:** 28 October 2026  
**Status:** Readiness checklist; not a legal certification or a claim of full compliance.

## Purpose and ownership

The LOC is responsible for deciding why participant and feedback data is collected, who may access it, how long it is kept, and how requests or incidents are handled. Assign a named LOC owner and backup for privacy requests, retention reviews, and security incidents before the event.

Privacy/grievance contact currently published on the website: **nhym2026jsr@gmail.com**. Review this mailbox regularly and restrict access to people authorised by the LOC.

## Current safeguards recorded in the implementation

- Bilingual Privacy Policy is published at `/privacy`.
- Registration UI links to the policy and requires a privacy acknowledgement.
- The Worker independently requires `privacyConsent: true`, validates date of birth, and rejects registrations where calculated age is below 18.
- Registration requires an email address; consent metadata is stored with the registration declaration record.
- Public feedback has a separate public-display consent requirement and request-size/rate-limit controls.
- Admin and finance APIs use access controls; private JSON responses use no-store cache headers.
- The visitor counter stores a hash of a random cookie identifier; public-feedback rate limiting stores a hash of the connecting IP rather than intentionally storing the raw IP in its rate-limit table.
- Feedback rate-limit records older than 24 hours are cleaned when another feedback request is processed. This is request-triggered cleanup, not a guaranteed scheduled task.

These are implementation notes, not proof that every legal obligation or every live user flow has been tested.

## Actions required before declaring the site fully ready

### 1. Assign operational owners

- [ ] Record the LOC privacy-request owner and backup.
- [ ] Record the incident-response owner and backup.
- [ ] Limit access to the privacy mailbox and registration/finance exports to authorised people with a genuine need.
- [ ] Brief all people who can access personal data on confidentiality, safe exports, and secure deletion.

### 2. Maintain a minimal privacy-request log

Keep a restricted-access log for requests received at the published contact address. Record only what is needed to manage the case:

- Case reference and date received.
- Request type: access, correction, deletion, consent withdrawal, feedback removal, or complaint.
- Identity-verification status (do not copy identity documents into the log).
- Data systems/records searched.
- Decision, reason for any retention exception, action owner, completion date, and response sent.
- Any follow-up date.

Verify the requester proportionately before disclosing or changing personal data. Do not promise deletion where a lawful retention duty or active dispute requires a record to be kept. Explain the decision and any applicable limitation to the requester.

### 3. Privacy-request workflow and completion controls

The public form records a request as `RECEIVED`; it does not itself disclose, correct, withdraw, or delete participant data. The restricted Admin workspace should be used for the following controlled sequence:

1. **Receive:** retain the case reference, request type, contact email, optional registration ID, received time, and only the minimum details needed.
2. **Triage:** move the request to `IN_REVIEW`. If the request concerns an individual record, change status to `NEEDS_VERIFICATION` while identity is being checked.
3. **Verify identity:** use a proportionate method such as matching registration details, calling a previously known contact, or in-person verification. Do not ask the requester to email identity-document images or record document numbers in the case log. Record only the method, outcome, verifier label, and timestamp.
4. **Assess scope and retention:** locate relevant registration, participant, consent, finance, email, export, and storage records. Check legal/accounting duties and any active dispute before correction or deletion.
5. **Carry out the action manually:** authorised staff make the approved correction or deletion in the relevant system, including linked records and copies where applicable. The Admin workflow deliberately does not mutate participant or finance data automatically.
6. **Resolve:** add a concise outcome note. A request cannot be marked `COMPLETED` unless identity is marked `VERIFIED`; deletion requests must record whether the data was deleted or retained under a documented exception. Declines require a reason.
7. **Audit and respond:** review the case audit history and send the requester a response through the approved contact channel. Status updates do not automatically email the requester in this version; staff must send and record the response manually.
8. **Review privileged reads:** the Admin workspace's sensitive-data access audit shows logged successful reads of the registration API used to populate participant reports/exports, plus successful and unmatched Participant Portal lookup attempts. It stores a hashed IP and request trace, not the raw IP. The current shared Admin token does not identify which individual administrator used it; do not treat the actor label as individual attribution.

Finance sessions must not be accepted by the Admin privacy-request or sensitive-data audit APIs. The source guard checks the Admin-token requirement, and the Finance/Admin runtime test checks the privacy-request queue when that route is present in the configured preview. If the shared preview returns an HTML SPA fallback for that route, the test skips that route with a warning rather than treating HTML as data; runtime isolation for the new access-audit endpoint remains unverified until the branch is deployed to an isolated Preview Worker. The access audit currently covers the registration-list API read path; it is not a full device, browser-download, screenshot, or offline-file monitoring system.

### 4. Data inventory and retention review

- [ ] Inventory personal data in D1 registration/participant tables, declarations, finance records, R2 gallery/finance documents, feedback, email delivery systems, exports, local downloads, and provider logs.
- [ ] Confirm the stated target of **31 December 2030** is justified for each record category; do not assume every field must be retained for the same duration.
- [ ] Document legal/accounting/dispute exceptions and who approves them.
- [ ] Define how approved deletion is performed in each system, including linked participant rows and R2 objects where applicable.
- [ ] Define how downloaded CSV/PDF files and local copies are returned or securely deleted.
- [ ] Schedule a periodic review and record its completion. Do not rely on the Privacy Policy alone as evidence of deletion.

### 5. Security incident procedure

If suspected unauthorised access, disclosure, loss, or alteration occurs:

1. Notify the designated LOC incident owner immediately using a private channel.
2. Preserve relevant logs and evidence; do not post personal data in public chats or issue trackers.
3. Contain the issue: revoke exposed sessions/tokens, restrict affected access, and stop an affected endpoint or integration if needed.
4. Record the timeline, data categories and approximate number of people affected, systems involved, containment steps, and remaining risks.
5. Assess applicable notification obligations and deadlines with qualified legal/security support. Notify affected people and authorities when required by applicable law.
6. Record remediation, owner, and follow-up checks. Do not claim an incident is closed until the corrective action is verified.

### 6. Live acceptance tests

Record date, tester, result, and evidence without storing unnecessary personal data.

- [ ] Registration cannot be submitted without privacy acknowledgement.
- [ ] Direct API submission with missing/false consent is rejected.
- [ ] Invalid dates, future dates, and dates that make the participant under 18 are rejected by the Worker.
- [ ] A valid adult registration succeeds in a controlled test environment; do not create fake records in production unless the LOC has approved and can remove the test record safely.
- [ ] Public feedback cannot be submitted for public display without its separate consent.
- [ ] Unauthenticated users cannot read registration, participant, admin, or finance records.
- [ ] Public feedback output does not expose unsubmitted/private fields; moderation/removal works as intended.
- [ ] Privacy Policy and contact email open and work on a mobile device.
- [ ] Registration confirmation and approval emails do not disclose more personal data than necessary.
- [ ] Data exports are accessible only to authorised roles and are stored/deleted safely.

### 7. Third-party services and access review

- [ ] Record the service providers that may process data (hosting, database, object storage, email delivery, source/deployment platform) and review their applicable terms/security settings.
- [ ] Confirm production secrets are not committed to source control or exposed in logs.
- [ ] Review Admin, Finance, and other privileged accounts; remove access no longer needed and use individual accounts where supported.
- [ ] Check that published gallery images and public feedback are intentionally public and have an appropriate basis/consent.
- [ ] Review backup/export retention and access, not only the primary database.

## Legal timing note

The Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025 have phased commencement. Confirm the provisions and deadlines in force on the date of each compliance review using the official Gazette and qualified legal advice. Preparing now is prudent; this checklist itself does not certify compliance.

## Review record

| Review date | Reviewer / LOC owner | Findings and remediation | Next review |
|---|---|---|---|
| 28 October 2026 | To be assigned by LOC | Initial operational checklist created; live acceptance tests and operational ownership must be recorded. | To be scheduled by LOC |
