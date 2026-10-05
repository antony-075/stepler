> Draft — requires legal review, confirmation of controller/processor roles, and completion of operator details before public launch.

## 1. Who is responsible for processing

Stepler is a service for collecting photos, videos, documents and text contributions through collections and guest links.

Operator: [LEGAL ENTITY NAME / OPERATOR NAME], [LEGAL ADDRESS]. Privacy contact: [LEGAL_CONTACT_EMAIL].

Depending on the activity and applicable law, Stepler may act as an independent controller for account, security, legal-compliance and service-operation data and/or as a service provider processing collection content on behalf of the collection administrator. The final legal characterization of these roles must be confirmed before launch.

*Draft addition* [LAWYER TO CONFIRM]: data protection officer: [DPO CONTACT, OR "NOT APPOINTED"]; representative in the EU under GDPR Art. 27, if the operator is established outside the EU: [EU REPRESENTATIVE].

## 2. Data we process

### Administrator data

We may process:

- email address;
- display name, if provided, or, when you sign in with Google and have no display name yet, the name from your Google profile;
- interface language;
- authentication and provider-account data: for Google sign-in, your Google account identifier, e-mail address and whether Google has verified it;
- session data and technical identifiers needed for secure sign-in;
- sign-in link requests: the e-mail address, time, language and a keyed one-way hash of the requesting IP address;
- the fact and version of acceptance of the Terms of Service and Privacy Policy, with its time and a technical request identifier (no IP address is stored with an acceptance);
- the collections you create and their settings: titles, descriptions, guest page texts and the images you upload for them (cover, background, collection image);
- technical logs needed for security, rate limiting, diagnostics and abuse prevention.

### Guest data

A guest does not create a normal user account. To provide guest access, Stepler creates a technical guest session associated with a particular collection.

We may process:

- a cryptographic guest-session identifier;
- collection and current guest-link identifiers;
- an optional guest name, if provided;
- session creation and activity timestamps;
- content voluntarily uploaded or submitted by the guest: photos, videos, documents and text messages (wishes);
- metadata about that content, including type, size, filename, creation time and technical processing data;
- metadata embedded in the files themselves (see section 5).

A guest name is not used as an authentication mechanism and is never shown to other guests. The guest name and the original filename are visible to the collection administrator; the filename is also visible to the guest who uploaded the file, and not to other guests.

### Report data

If you report content, we may process your contact and technical data, report description, reason category, identifiers of the reported content and collection, report time and a technical request identifier.

In the current version of the Service, reports are sent by e-mail; we then process your e-mail address and what you write to us.

### Technical data

For security, rate limiting and abuse prevention, the Service may temporarily process an IP address and other technical request attributes. An IP address is not used as the identity of a guest or as the ownership mechanism for guest content.

In particular: rate-limit counters keyed by IP address are kept only in server memory, for up to one hour; server request logs contain the IP address, browser user agent, requested address (with access tokens removed), time and a request identifier; and sign-in link requests store a keyed one-way hash of the IP address for abuse investigation. Logs do not contain cookies, passwords, tokens, text messages, guest names or filenames.

## 3. How we use data

We use data to:

- create and maintain administrator accounts;
- send magic links and provide Google OAuth sign-in;
- create and manage collections and guest links;
- receive, store, display, preview, process and delete content;
- enforce access settings configured by administrators;
- protect the Service, apply rate limits, and detect and prevent abuse;
- handle content reports and potentially illegal or harmful content;
- comply with legal obligations and protect the rights of Stepler, users and third parties;
- diagnose problems, provide support and improve Service reliability.

We do not use uploaded photos, videos, documents or messages for advertising campaigns or sell them to third parties.

## 4. Legal bases

Depending on the activity and applicable law, processing may rely on:

- performance of a contract or steps requested before entering into a contract;
- compliance with a legal obligation;
- legitimate interests, including security, fraud prevention, Service protection and abuse handling, where those interests are not overridden by the individual's rights and freedoms;
- consent, where applicable law requires consent.

The final legal-basis matrix for each processing activity must be confirmed by the operator and legal counsel.

*Draft addition — proposed bases per purpose* [LAWYER TO CONFIRM]:

- administrator account, sign-in, collections and guest links: performance of a contract (GDPR Art. 6(1)(b));
- receiving, storing, displaying and deleting guest content, and the optional guest name: performance of the contract with the administrator, and our and the administrator's legitimate interest in providing the collection the guest chose to contribute to (Art. 6(1)(b) and (f));
- security, rate limiting, bot protection, logs and abuse prevention: legitimate interests (Art. 6(1)(f));
- handling content reports and requests from authorities: legal obligation where one applies, otherwise legitimate interests (Art. 6(1)(c) and (f));
- recording the acceptance of these documents: legal obligation and legitimate interests in being able to prove it (Art. 6(1)(c) and (f));
- preference cookies (language, theme, sidebar): set only when you choose a preference, as part of the service you request.

For users in Ukraine, personal data is processed in accordance with the Law of Ukraine "On Personal Data Protection"; the corresponding grounds are those of its Article 11 (consent, a contract with the data subject, a legal obligation, and the legitimate interest of the controller or a third party).

Providing data: an e-mail address is required to create an administrator account; without it we cannot provide one. A guest name is optional. All content is submitted voluntarily.

## 5. Collection content

The collection administrator controls who can access collection content and to what extent. If a link is configured as a shared gallery, submitted content may be visible to other guests.

Stepler does not use collection content for its own advertising purposes. Stepler does technically process content to store it, generate previews, deliver it to authorized users, and perform deletion and security operations.

If you upload content belonging to another person or containing another person's personal data, make sure you have an appropriate legal basis for doing so.

Original files are stored unchanged, including metadata embedded in them by the camera or app, such as EXIF data (device, time and, if location was enabled, the place where a photo was taken). The thumbnails and previews that Stepler generates for viewing contain no such metadata. The original file, with its metadata, is available to the collection administrator and, if the link has a shared gallery, to other guests who can view and download it. If you do not want to share such metadata, remove it before uploading.

## 6. Cookies and guest sessions

Stepler uses necessary cookies for authentication and guest-session functionality.

Cookies set by Stepler:

- `st_session` — the administrator's sign-in session; HttpOnly; 30 days;
- `st_oauth` — a signed, short-lived record of a Google sign-in in progress; HttpOnly; 10 minutes, sent only to the Google sign-in routes;
- `st_gs` — the guest session for one collection; HttpOnly; 400 days, renewed when you open the guest link again, sent only to that collection's requests;
- `st_locale`, `st_theme`, `st_sidebar` — your language, colour theme and admin sidebar preferences; set only when you choose them; 1 year.

Cloudflare Turnstile, which protects the e-mail sign-in form, runs a script from Cloudflare on the sign-in page that evaluates technical browser signals to tell people from bots [LAWYER TO CONFIRM against Cloudflare's documentation whether it stores anything in the browser].

A guest session is stored in an HttpOnly cookie scoped to a particular collection. Stepler does not use browser fingerprinting or an IP address as the ownership mechanism for guest content.

Necessary cookies are used to provide requested functionality and security. The current MVP does not use a third-party advertising cookie system or behavioral analytics.

## 7. Third-party providers

Stepler may use:

- Google for OAuth authentication when selected by the user;
- Cloudflare Turnstile for bot protection on the e-mail sign-in form;
- Cloudflare R2 object storage for files and derived objects;
- an email provider for magic-link delivery: currently Brevo;
- hosting and other infrastructure providers for the API, web application, database and background processing: currently Render (region Frankfurt, Germany), whose network is fronted by Cloudflare, so requests to the Service pass through Cloudflare.

*Draft note:* the list above describes the current (staging) setup; the production providers must be confirmed before launch [LAWYER TO CONFIRM].

The current architecture is intended to place core infrastructure and storage in EU regions where practical: hosting and the database are in Frankfurt (Germany), and the file storage bucket is in Cloudflare's EU jurisdiction. The specific provider list may change; material changes in processing will be reflected in this Policy where required.

## 8. Transfers outside the EEA

Some providers may process data outside the European Economic Area. Where such a transfer is subject to GDPR or another applicable cross-border transfer regime, Stepler will use an appropriate legal transfer mechanism, such as an adequacy decision or Standard Contractual Clauses where required.

The exact list of countries, providers and transfer mechanisms must be confirmed before public launch.

*Draft note* [LAWYER TO CONFIRM]: Render, Cloudflare and Google are companies based in the United States, so transfers to or access from the USA are possible even where data is stored in the EU; the safeguards (for example, the EU–US Data Privacy Framework or Standard Contractual Clauses in the providers' data processing agreements) must be checked for each provider. If the operator is established outside the EEA, the transfer to the operator itself must be covered as well.

## 9. Retention

The MVP does not automatically delete old collections under a fixed retention schedule. Data is retained for as long as reasonably necessary to operate the active Service, comply with legal obligations, maintain security and protect legal rights.

Deleted content becomes unavailable immediately. Physical files and derived objects are deleted asynchronously after the relevant record is deleted or a cleanup task is queued.

Unused guest sessions may be cleaned up according to the Service's technical maintenance policy. The current architecture provides for removal of inactive sessions that never contributed after approximately 400 days; the exact value is configurable.

Security and audit records may be retained longer where reasonably necessary for security, abuse investigations or legal obligations.

*Draft addition — retention by category* (current behaviour of the Service; periods without a value must be set and confirmed [LAWYER TO CONFIRM]):

- administrator account (e-mail, name, language, linked Google account, acceptances of these documents): until the account is deleted on request;
- administrator sign-in session: 30 days from sign-in, or until you sign out;
- sign-in link requests (e-mail, time, hashed IP address): currently kept without a fixed period — [RETENTION PERIOD];
- collections and their content, guest names and text messages: until deleted by the administrator, by the guest (where allowed) or together with the collection or account;
- guest sessions: deleted together with their collection; sessions that never contributed anything are deleted after about 400 days without activity;
- unfinished uploads: expire after 24 hours and their partial files are deleted;
- deleted content and collections: hidden immediately; their files and records are then permanently deleted by a background task, normally within an hour, with automatic retries for anything left over;
- audit records (which action was done to which collection or item, by which kind of actor, when; no content, names or filenames): currently kept without a fixed period — [RETENTION PERIOD];
- server request logs: kept by the hosting provider for [LOG RETENTION PERIOD];
- rate-limit counters: in memory, for up to one hour.

## 10. Security

We apply technical and organizational measures proportionate to the risks of the Service, including server-side authorization, scoped storage capabilities, protected cookies, hashing of session and link secrets, file-type validation and rate limiting.

No method of transmission or storage is completely secure. If a security incident occurs, we will respond as required by applicable law.

## 11. Your rights

Depending on applicable law, you may have rights to access, correct or delete personal data, restrict processing, object to certain processing, receive portable data, and withdraw consent where processing is based on consent.

You may also have the right to lodge a complaint with a competent data-protection supervisory authority.

To make a privacy request, contact [LEGAL_CONTACT_EMAIL] and, where possible, identify the account, collection or content concerned. Guests without an email account may need to identify the relevant collection and content item.

We answer requests within one month of receipt; where a request is complex, this period may be extended as permitted by law, and we will tell you why [LAWYER TO CONFIRM]. Users in Ukraine also have the rights set out in Article 8 of the Law of Ukraine "On Personal Data Protection".

We may request enough information to verify the requester and prevent disclosure of another person's data.

## 12. Deletion requests

Administrators can delete their content and collections through the Service. Guests can delete their own content through their guest session when permitted by the current guest link.

A request to delete personal data may be sent to [LEGAL_CONTACT_EMAIL]. Deletion may be limited where retention is necessary for a legal obligation, security, fraud prevention, or the establishment, exercise or defense of legal claims.

## 13. Children

Stepler is not specifically directed at children. Administrators must not use the Service to unlawfully collect children's personal data. If you believe a child has provided personal data in violation of applicable law, contact [LEGAL_CONTACT_EMAIL].

*Draft addition* [LAWYER TO CONFIRM]: an administrator account requires the age of 18 (see the Terms of Service). Guests under [MINIMUM AGE] may contribute only with the permission of a parent or guardian. Photos and videos from events often show children; whoever uploads them is responsible for having the permission of their parents or guardians, and a parent or guardian may ask us to delete such content.

## 14. Content reports and illegal content

We accept reports concerning potentially illegal or rights-infringing content. A report should, where possible, include the content link or identifier, the reason for the report and information that helps us assess it.

Reports may be handled by the Service operator and, where necessary, shared with competent authorities or other authorized parties.

Whether specific DSA obligations apply to Stepler depends on jurisdiction and the Service's actual operating model and must be separately confirmed before launch.

## 15. Automated decisions and profiling

Stepler does not make decisions producing legal or similarly significant effects on a person solely through automated profiling.

Technical automated checks may block requests, files or actions to protect the Service from bots, quota abuse or unsafe file formats.

## 16. Updates to this Policy

We may update this Policy. A new version will be published with a version number and effective date.

Where a change requires renewed acceptance, the process will be determined in accordance with applicable law and Stepler's functionality.

## 17. Contact

For privacy and personal-data matters: [LEGAL_CONTACT_EMAIL].

Operator: [LEGAL ENTITY NAME / OPERATOR NAME], [LEGAL ADDRESS].

Supervisory authority: where GDPR applies, you may lodge a complaint with the competent data-protection authority in the relevant EU Member State, in particular where you live, work or where the alleged infringement took place. Users in Ukraine may contact the competent authority under Ukrainian law, the Ukrainian Parliament Commissioner for Human Rights [LAWYER TO CONFIRM].
