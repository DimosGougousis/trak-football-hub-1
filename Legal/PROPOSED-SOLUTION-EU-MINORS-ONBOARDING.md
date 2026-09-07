# Proposed Solution: EU-Compliant Minor Onboarding and Private Data Sharing

| Document control | Value |
| --- | --- |
| Product | TRAK Football Hub |
| Status | **PROPOSED — pending product, safeguarding and legal approval** |
| Research date | 7 September 2026 |
| Scope | EU academy-based onboarding, parental authorisation and private player-data sharing; separate UK considerations |
| Intended audience | Product owners, engineering, academy operators, privacy counsel and safeguarding leads |
| Implementation status | Not assessed; this document does not certify existing application controls |

> This proposal converts the research into a recommended operating model. It is not legal advice, a completed DPIA, an approved consent form or a declaration of compliance. Launch-country counsel must confirm the applicable rules and approve implementation before real minors are onboarded.

Related research: [Vercel hosting and minors GDPR research](GDRP%20MINORS%20on%20VERCEL). This proposal supplements that note without endorsing every technical or legal claim in it. Where scope, exemptions or national rules matter, use the qualifications below and obtain legal review.

## 1. Decision requested

Approve an **invitation-only, academy-assisted, guardian-linked pilot**, with private player profiles and purpose-specific access controls.

The proposed model is:

1. The academy verifies membership and assists in verifying the parent–child relationship.
2. A holder of parental responsibility authorises consent-based processing where national law requires it.
3. The child receives an age-appropriate explanation and gives their own consent where required, or meaningful assent where appropriate.
4. Essential coaching records use a documented lawful basis; optional health processing and media uses are assessed separately.
5. The application enforces these permissions at the backend and storage layers.

**The academy's signature is not a substitute for parental consent.** Equally, parental consent is not a blanket licence to collect, publish or reuse a child's information.

### Proposed pilot boundaries

| Include | Exclude or defer |
| --- | --- |
| Private training logs and coach feedback | Public player profiles and searchable youth directories |
| Approved academy and squad membership | Open communities and cross-academy browsing |
| Verified guardian links with defined access | Self-declared guardian access without approval |
| Optional wellness only after legal approval and separate controls | Mandatory injury, mood or sleep disclosure for ordinary participation |
| Restricted coaching media, if approved | Public media links, promotional publication and unrestricted downloads |
| Appropriate safeguarding/reporting channels | Unmonitored private adult–child messaging |
| Human-reviewed coaching recommendations | Solely automated selection, exclusion or recruitment decisions |
| Necessary operational processing | Advertising to minors and identifiable minor-data reuse for AI training |

These boundaries are **product recommendations**, not a claim that every listed feature is universally prohibited by law.

## 2. Legal requirements and applicability

### 2.1 GDPR baseline

The GDPR applies to identifiable player information, including profiles, attendance, performance statistics, ratings, photographs, training videos and coach comments. [S1]

| Obligation | Application requirement |
| --- | --- |
| Articles 5 and 25: minimisation, purpose limitation, storage limitation and privacy by default | Collect only necessary fields; define retention per purpose; make child records private by default. |
| Articles 6–8: lawful basis and consent | Map a lawful basis to each purpose. Apply national digital-consent rules when Article 8 is engaged. |
| Article 9: special-category data | Establish both an Article 6 basis and an applicable Article 9 condition for health information. |
| Articles 12–14: transparency | Provide child-friendly and adult notices, including where data originates from an academy rather than the player. |
| Articles 15–22: individual rights | Support access, correction, deletion, applicable portability and objections; assess significant automated decisions. |
| Articles 26 and 28: allocation of roles | Document joint-controller arrangements or processor instructions where those roles actually apply. |
| Articles 30 and 32: accountability and security | Maintain processing records and risk-appropriate technical and organisational safeguards. A small-company exemption is not a blanket exemption for regular or sensitive processing. |
| Articles 35–36: impact assessment | Complete a DPIA where processing is likely to result in high risk; consult the authority if high residual risk cannot be mitigated. |
| Articles 37–39: DPO | Assess large-scale monitoring, large-scale special-category processing and additional national requirements. |
| Chapter V: international transfers | Assess EEA-external hosting, remote support, analytics, email, verification and AI suppliers. |

Consent is not always the right basis for essential academy administration. A valid alternative may exist, but it must be justified rather than chosen to bypass child protections. In particular:

- An academy–TRAK contract does not automatically establish contractual necessity for processing a child's data: Article 6(1)(b) concerns a contract to which the data subject is party.
- Legitimate interests require a documented necessity and balancing assessment with particular weight given to children's rights.
- Contract and legitimate interests alone do not satisfy Article 9.
- Contract acceptance, privacy-notice acknowledgement and GDPR consent must be distinguishable. [S2–S4]

### 2.2 Digital-consent age is not a universal app-use age

Article 8 applies when consent is the Article 6 basis for an information-society service offered directly to a child. The default threshold is 16; Member States may lower it to no less than 13. Below the applicable threshold, consent must be given or authorised by the holder of parental responsibility, with reasonable verification efforts. [S3]

| Selected market | Threshold | Qualification |
| --- | --- | --- |
| Greece | 15 | Article 21 of Law 4624/2019 addresses authorisation below 15 through the legal representative. The cited country explanation is a secondary legal source; validate the operative national text before launch. [S5] |
| France | 15 | For relevant consent-based online processing below 15, joint agreement of the child and holder of parental authority is required. CNIL explains that one parent's express agreement can ordinarily suffice, while allowing the other to object. [S6] |
| Spain | 14 | Other laws may require parental assistance for the underlying act or transaction. [S7] |

This table is illustrative, not a complete EU launch matrix. The threshold does not determine every issue of contractual capacity, health-data consent, image rights or parental access. Do not determine applicable law solely from an IP address or academy location.

**Proposed action:** restrict the pilot to named, legally reviewed markets and implement versioned country/age rules. Do not treat “under 18” and “below the Article 8 threshold” as interchangeable categories.

### 2.3 Health and wellness information

| Data category | Assessment |
| --- | --- |
| Position, attendance, goals and passing statistics | Usually ordinary personal data, unless context or inferences reveal health information. |
| Injury, pain, medical restrictions and rehabilitation | Health data under Article 9. |
| Sleep, fatigue, mood and readiness | May reveal health information depending on context, purpose and inference; assess conservatively. |
| Ordinary photos and video | Personal data, but not automatically special-category biometric data. |
| Biometric templates used for unique identification | Special-category biometric data. |

Optional explicit consent may provide an Article 9 condition where lawful and genuinely freely given. National rules on children's capacity and health data require separate review. A coach is not automatically a healthcare professional, and nonprofit sports status does not create a general Article 9 exemption. [S8]

**Proposed action:** make wellness a separately approved module. Do not penalise refusal through selection or coaching decisions. Limit staff access; a simplified “not fit to train” flag still constitutes health information.

### 2.4 Digital Services Act

Assess the actual service rather than assuming every app is an online platform. A genuinely closed, admission-controlled academy service may not disseminate information to the public; public profiles and open communities may change this. Other hosting/intermediary duties may still apply. [S9]

For covered online platforms, Article 28 requires appropriate and proportionate protection of minors and prohibits profiling-based advertising when the provider knows with reasonable certainty that the recipient is a minor. Article 19 contains relevant micro/small-enterprise exemptions, subject to exceptions.

The Commission's July 2025 minors guidelines are nonbinding guidance used in assessing compliance, not a standalone law or automatic compliance certificate. They recommend private defaults, safer communications, reporting tools, proportionate age assurance and avoiding harmful engagement patterns. [S10]

**Proposed action:** adopt these safeguards even if TRAK qualifies for an exemption; document the scope assessment before enabling public or social features.

### 2.5 Other applicable or conditional rules

- **ePrivacy and national implementation:** assess nonessential cookies, pixels and mobile SDK access/storage; obtain consent where required and apply separate electronic-marketing rules. Necessary technologies and national exemptions must be assessed specifically. [S11]
- **Consumer law:** provide transparent prices, subscription and cancellation terms. Avoid direct exhortations to children to buy or persuade adults to buy. [S12]
- **Family, image-rights and safeguarding law:** review parental authority, custody disputes, photography, coach conduct and reporting duties for each launch country.
- **AI Act:** classify actual use cases. Training recommendations are not automatically high-risk. Recruitment, educational access, biometric identification and emotion recognition can trigger different obligations. Harmful exploitation of age-related vulnerability is prohibited. Assess disclosures and human oversight before introducing AI. This proposal does not rely on an unverified amendment or high-risk implementation deadline. [S13]
- **Medical Devices Regulation:** if intended functions include diagnosis or injury treatment, obtain a medical-device scope assessment; a disclaimer alone is not decisive. [S14]
- **UK expansion:** separately assess UK GDPR, the Data Protection Act, the ICO Children's Code and Online Safety Act scope. Closed groups do not automatically remove online-safety obligations. [S15–S16]

## 3. Proposed responsibility model

| Party | Proposed responsibility |
| --- | --- |
| Academy | Controller for academy-directed administration and coaching records; determines appropriate purposes, authorised staff, retention and safeguarding procedures. |
| TRAK | Processor for academy-controlled activities where it acts only on documented instructions. May separately be controller for independently determined activities such as billing or account security. |
| Coaches and administrators | Act under academy authority and purpose-specific permissions; employment or coaching status does not grant unrestricted access. |
| Parent/legal guardian | Supplies authorisation where legally entitled and required; receives only appropriately authorised access. |
| Player | Remains the data subject; receives clear information and exercises rights according to applicable law and capacity. |
| Suppliers | Classified according to their actual role, with processor contracts and transfer safeguards where applicable. Not every supplier is necessarily a processor. |

If TRAK and the academy jointly determine purposes and essential means, assess Article 26 joint controllership instead. Contract labels cannot override actual conduct.

### Academy agreement requirements

The agreement should address instructions, confidentiality, security, authorised staff, subprocessors, international transfers, rights-request assistance, breach escalation, retention/deletion, audit rights and termination. It must identify responsibility for verifying parental authority and preserving consent evidence.

An academy may collect authorisation on a parent's behalf as an administrative process, but the decision must originate from a legally authorised person. Existing forms are reusable only if their scope, choices and evidence cover the intended processing. A general club-administration/media form should not be assumed to cover optional health analytics, public promotion or AI training.

## 4. Proposed onboarding and consent workflow

### Step 1 — Academy and staff approval

Verify the organisation and authorised administrator. Assign a privacy contact and safeguarding lead. Approve the contractual roles, country configuration and permitted features before invitations are issued.

### Step 2 — Minimal invitation

Use a short-lived, single-use invitation through an established enrolment contact. Do not expose a child directory. Pre-consent invitation records require their own lawful basis, minimum necessary fields and expiry/deletion policy.

### Step 3 — Authenticate and verify the relationship

The adult verifies control of their email/phone, declares their relationship and parental authority, and is matched to the academy's existing enrolment records. Inconsistencies go to manual review.

An email OTP verifies an inbox, not parental responsibility. ID, payment-card and adult-age checks do not by themselves establish the parent–child relationship. Use risk-proportionate checks and avoid routine passport, birth-certificate or facial-scan collection when less intrusive methods suffice. Preserve the verification result and necessary evidence references rather than excessive identity documents. [S17–S18]

### Step 4 — Determine age and applicable rules

Collect only age information necessary for the service and consent routing; exact date of birth must have a justified purpose. Apply the reviewed national rules, including health-data and contractual-capacity questions. Ambiguous jurisdiction or authority requires review, not automatic approval.

### Step 5 — Explain purposes and recipients

Provide layered notices naming the relevant controllers, purposes, lawful bases, data categories, recipients, retention, transfers, rights and complaint contact. Show the child what parents and coaches can see. Do not promise confidentiality that the system cannot enforce.

### Step 6 — Capture separate choices

| Purpose | Proposed treatment |
| --- | --- |
| Essential account and coaching records | Explain the actual lawful basis; do not disguise necessary processing as optional consent. |
| Optional injury/wellness | Separate explicit consent where relied upon, with restricted recipients and withdrawal controls. |
| Private coaching video | Clearly specified purpose and audience; separate permission where required. |
| Public website/social-media promotion | Disabled for the pilot; future separate opt-in and image-rights assessment. |
| Marketing | Separate optional choice if introduced; no bundled acceptance. |
| Identifiable minor data for AI model training | Excluded from the proposed pilot. |

No pre-ticked optional choices. Refusing optional publicity or tracking must not unfairly affect ordinary academy participation. Consent cannot legitimise unnecessary or unfair processing. [S4]

### Step 7 — Child explanation and activation

Give an age-appropriate explanation and obtain the child's consent where required or meaningful assent where appropriate. Where authorisation is required, keep the affected functions unavailable until verified. Do not interpret guardian approval as permission to bypass the child's legally protected choices.

### Step 8 — Record and enforce permissions

Keep a protected, versioned consent record containing:

- Child and authorising-person identifiers.
- Relationship-verification method, outcome and necessary evidence reference.
- Applicable country/age-rule version.
- Purpose identifiers, choices, consent wording and privacy-notice versions.
- Timestamps and subsequent withdrawal/replacement events.
- Relevant academy/recipient scope.

A mutable `parent_consent = true` field is insufficient evidence. Consent records themselves are personal data and require access controls and retention limits.

### Step 9 — Ongoing changes and withdrawal

Provide withdrawal as easily as consent was given. Stop the affected consent-based processing and delete information unless another valid retention basis applies. Withdrawal does not retrospectively invalidate lawful past processing.

Review permissions when the child reaches the relevant consent age, turns 18, leaves the academy, changes clubs, gains/loses a guardian link, or receives a materially different feature. Obtain the child's own consent for ongoing consent-based processing when required; do not retain parental control indefinitely by default. Handle disputed custody through a documented review process.

## 5. Proposed access and security controls

| Information | Proposed audience |
| --- | --- |
| Training history and feedback | Player, appropriately authorised guardian and assigned coaches. |
| Injury/wellness details | Player and specifically authorised people with a demonstrated need; not all academy staff. |
| Team attendance | Relevant team staff; minimise visibility to other families. |
| Parent contact details | Relevant staff, not every team member by default. |
| Coaching photos/videos | Restricted authorised audience; no public links by default. |
| Ratings and progress | Personal improvement views; avoid public identifiable youth rankings. |

Required implementation work should include:

- Backend/database authorisation and tenant isolation, including direct API and storage requests.
- Separate account, player-record, guardian-link, squad-membership and consent concepts.
- Private storage and controlled, short-lived media access where appropriate.
- Risk-appropriate encryption, privileged-access MFA, access logging and prompt staff offboarding.
- No child health details in push notifications, error telemetry, analytics or routine logs.
- No production children's data in development, screenshots, fixtures or public previews.
- No automatic cross-academy history sharing after a transfer.
- A process for other children appearing in uploaded videos; one parent's permission does not cover everyone depicted.
- Safeguarding reporting and escalation, with retention of necessary evidence under an identified basis.

No system can completely prevent screenshots or onward sharing by authorised recipients. Explain limitations and combine technical restrictions with staff rules and incident response.

## 6. Industry precedents and lessons

These are published practices checked during the research, not independent audits or proof of legal compliance. Do not adopt another platform's age threshold as a universal European rule.

| Platform | Published approach | Lesson for TRAK |
| --- | --- | --- |
| Spond | Under-15 users require guardian approval; registered guardians can see child activity in joint groups. Spond Club identifies a processor role for club-controlled activities. [S19] | Separate guardian links, membership and processing roles. |
| Heja | Parent onboarding includes a team code and email verification. Existing child-profile links require approval by an existing guardian or team administrator. Parents can edit child information and visibility. [S20–S21] | An approved relationship should control access, not a self-selected “parent” role. |
| TeamSnap | Separates account users from player records. Under-13s cannot create accounts, while authorised adults may supply player information. Its European notice states reasonably verified parental consent for under-16 data processing. [S22] | A child can have a player record without an independent login. Do not copy broad policy language as proof of valid consent. |
| Strava | Excludes under-13 users. Teen defaults include followers-only activities, hidden route start/end sections and exclusions from specified product-improvement contributions; under-18 messaging is disabled. Some privacy defaults are changeable. [S23–S24] | Provide age-specific product protections beyond a consent screen. |

## 7. Delivery plan and acceptance evidence

No phase below is recorded as complete. Owners are proposed roles, not assigned individuals.

| Phase | Proposed owner | Deliverables / exit evidence |
| --- | --- | --- |
| 1. Legal scope | Product + privacy counsel | Named markets/ages; data map; per-purpose lawful-basis matrix; health-data, DSA, UK and conditional AI/medical-device assessments. |
| 2. Governance | Academy lead + privacy lead | Signed role-appropriate agreements; supplier/transfer register; processing records; retention schedule; DPIA and documented DPO decision. |
| 3. Product controls | Engineering + design | Guardian verification, versioned consent, private defaults, scoped permissions, notices and withdrawal workflows. |
| 4. Verification | QA + security + safeguarding | Negative authorisation tests, withdrawal/deletion tests, invitation-abuse tests and safeguarding/incident exercises. |
| 5. Pilot approval | Product owner + academy + legal approver | Written approval of residual risks, support responsibilities and permitted pilot scope. |

### Proposed acceptance criteria

1. An unapproved guardian cannot access a child's records through the UI, API or storage; a valid approved link permits only its defined scope.
2. A coach cannot read another academy's records or unassigned sensitive records; legitimate assigned access works.
3. Declining optional wellness prevents its collection and use while preserving ordinary training functionality.
4. Withdrawal disables future affected processing and triggers the documented deletion/retention workflow; necessary evidence remains access-controlled.
5. Expired, reused or tampered invitations fail without disclosing child information.
6. Public and unauthenticated requests cannot retrieve private profiles or media.
7. Consent history reconstructs what was authorised, by whom, when and under which wording; later changes do not erase the history.
8. Age transitions and academy departures trigger permission review; they do not silently preserve outdated guardian/coach access.
9. Test telemetry and notifications contain no sensitive child payloads; authorised operational events remain diagnosable.
10. Rights requests can be routed to the correct controller and fulfilled without exposing another child's information.

These tests are proposed evidence requirements; they have not been run as part of this research.

## 8. Operational compliance and launch blockers

### Operational requirements

- **DPIA:** minors, longitudinal evaluation and health information are strong high-risk indicators. Complete one before the pilot; the legal test is likely high risk, not simply any processing about a child. [S25]
- **DPO:** document the assessment. A DPO is not automatically mandatory solely because children use the app. [S26]
- **Rights:** generally respond within one month, with lawful extensions and identity/authority checks where applicable.
- **Breaches:** processors notify the controller without undue delay. Controllers notify the supervisory authority within 72 hours of awareness where required; high-risk breaches may also require notifying affected individuals without undue delay. Not every incident is reportable. [S1]
- **Retention:** no universal GDPR retention period exists for football records. Set purpose-specific periods covering accounts, health data, media, invitations, audit evidence and backups.
- **Transfers:** EEA hosting is not an EEA-only processing guarantee. Assess overseas support and every relevant integration. Use an applicable adequacy decision or other lawful safeguards, including SCCs and necessary assessments/supplementary measures where appropriate.
- **Certification:** supplier certifications do not establish that TRAK's processing is lawful. This proposal does not assert a universal requirement for a GDPR certificate or pre-launch regulator approval.

### Decisions requiring approval

| Open question | Why it blocks or changes launch |
| --- | --- |
| Which countries and exact age bands launch first? | Determines consent, capacity and national safeguards. |
| Will injury, pain, mood or sleep information be collected? | Determines Article 9 conditions, access controls and DPIA scope. |
| Is TRAK academy SaaS, a direct-to-family product, or both? | Changes controller/processor roles and lawful-basis analysis. |
| Will media, messaging or public sharing be enabled? | Changes safeguarding, recipient permissions and DSA/UK scope. |
| Are AI recommendations or athlete-selection functions enabled? | Requires use-case classification, supplier review and decision safeguards. |
| What establishes parental responsibility in each market? | Authentication alone does not establish legal authority. |
| What can guardians see as children mature? | Requires national-law and child-rights assessment. |
| Which suppliers receive identifiers, health information or prompts? | Determines contracts, transfers, retention and secondary-use risks. |

**Final recommendation:** approve this as a design direction, not as legal clearance. Begin with private academy coaching records, implement academy-assisted guardian verification, and defer optional high-risk features until their separate legal and technical controls are approved.

## 9. Research sources

Sources were collected for the 7 September 2026 research. Vendor pages and guidance can change. Legislative text controls over summaries; secondary sources and product policies are identified below. Not all linked statutory pages were machine-readable during research, so launch counsel should verify operative consolidated texts and national amendments.

- **S1 — GDPR, official legal text:** <https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng>
- **S2 — GDPR Article 6, readable unofficial reproduction:** <https://gdpr-info.eu/art-6-gdpr/>
- **S3 — GDPR Article 8, readable unofficial reproduction:** <https://gdpr-info.eu/art-8-gdpr/>
- **S4 — EDPB Guidelines 05/2020 on consent:** <https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en>
- **S5 — Greek Law 4624/2019 Article 21, secondary legal explanation:** <https://www.activemind.legal/law/gr-legal-basis/>
- **S6 — CNIL, parental and child consent below 15:** <https://www.cnil.fr/fr/recommandation-4-rechercher-le-consentement-dun-parent-pour-les-mineurs-de-moins-de-15-ans>
- **S7 — AEPD, Spanish minor-consent age:** <https://www.aepd.es/preguntas-frecuentes/10-menores-y-educacion/FAQ-1001-cual-es-la-edad-para-que-los-menores-puedan-prestar-consentimiento-para-tratar-sus-datos-personales>
- **S8 — GDPR Article 9, readable unofficial reproduction:** <https://gdpr-info.eu/art-9-gdpr/>
- **S9 — Digital Services Act, official legal text:** <https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng>
- **S10 — Commission, 2025 minors guidelines and scope explanation:** <https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-protection-minors>
- **S11 — ePrivacy Directive, official legal source; check consolidated amendments and national implementation:** <https://eur-lex.europa.eu/eli/dir/2002/58/oj>
- **S12 — Unfair Commercial Practices Directive, including Annex I(28):** <https://eur-lex.europa.eu/eli/dir/2005/29/oj>
- **S13 — Commission AI Act overview:** <https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai>
- **S14 — Medical Devices Regulation, official legal source for conditional scope review:** <https://eur-lex.europa.eu/eli/reg/2017/745/oj>
- **S15 — ICO Children's Code:** <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/>
- **S16 — UK Online Safety Act, official legal source for separate scope review:** <https://www.legislation.gov.uk/ukpga/2023/50/contents>
- **S17 — CNIL, proportionate age and parental-authority verification:** <https://www.cnil.fr/fr/recommandation-7-verifier-lage-de-lenfant-et-laccord-des-parents-dans-le-respect-de-sa-vie-privee>
- **S18 — EDPB Statement 1/2025 on Age Assurance:** <https://www.edpb.europa.eu/our-work-tools/our-documents/statements/statement-12025-age-assurance_en>
- **S19 — Spond published privacy policy:** <https://www.spond.com/en-us/privacy/>
- **S20 — Heja published parent-onboarding instructions:** <https://help.heja.io/en/articles/9618901-setting-up-your-parent-account-on-heja-connecting-to-your-child-team>
- **S21 — Heja published child-profile and visibility instructions:** <https://help.heja.io/en/articles/3298274-how-do-i-edit-my-child-s-information>
- **S22 — TeamSnap published privacy policy, especially sections 5 and 14.4:** <https://www.teamsnap.com/privacy-policy>
- **S23 — Strava published privacy policy:** <https://www.strava.com/legal/privacy>
- **S24 — Strava published under-18 privacy controls:** <https://support.strava.com/hc/en-us/articles/4412328250893-Your-Privacy-Control-Defaults-When-You-re-Under-18-on-Strava>
- **S25 — GDPR Article 35, readable unofficial reproduction:** <https://gdpr-info.eu/art-35-gdpr/>
- **S26 — GDPR Article 37, readable unofficial reproduction:** <https://gdpr-info.eu/art-37-gdpr/>
- **S27 — CNIL sports-sector reference for further review:** <https://www.cnil.fr/fr/sport-amateur-hors-contrat/questions-reponses>
