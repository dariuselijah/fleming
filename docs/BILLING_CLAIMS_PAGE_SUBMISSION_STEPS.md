# BillingClaims Page Claim Submission Steps

This document explains the claim submission sequence that is attached to `src/presentation/web-application/pages/BillingClaims.tsx`.

It follows the exact current implementation path:

```text
BillingClaims.tsx
  -> UnifiedClaimModal mode="submit"
  -> submitToMedikredit()
  -> MediKreditClaimService.submitClaim()
  -> MedikreditService.sendSOAPRequest()
  -> POST /api/medikredit
  -> backend/lib/medikredit-soap-client.mjs
  -> MediKredit SOAP endpoint
```

Secret values are intentionally redacted. The request structure includes the username/password fields and auth format, but docs must not store live passwords.

## 1. What `BillingClaims.tsx` Owns

`BillingClaims.tsx` does not send the MediKredit SOAP request directly. It owns the page-level workflow that gets a claim into the submission modal.

The relevant page responsibilities are:

- load and transform claims through `useBillingClaims(practiceId)`;
- create generated claims from `AppointmentClaimCreator`;
- save generated claims to Supabase with `saveClaim`;
- open `UnifiedClaimModal`;
- run usage/plan/overage checks before submission;
- receive the final submission callback from the modal;
- increment claim usage and create overage charge records;
- refresh the claims list.

Important: `BillingClaims.tsx` initializes `useClaimSubmission`, but the active page path does not call `submitClaim` from that hook for the visible "Submit Claim" workflow. The active workflow is the `UnifiedClaimModal` path.

## 2. Entry Points From `BillingClaims.tsx`

### Entry Point A: Submit Existing Claim From "My Claims"

`ClaimManagementInterface` receives:

```tsx
onSubmitClaim={handleSubmitClaim}
```

When a user submits an existing claim, `handleSubmitClaim(claim)` runs.

Logic:

1. Start with the claim object passed from the claim list.
2. If `claim.items` is missing or empty, fetch the full claim from Supabase:

```ts
supabase
  .from('claims')
  .select('*, items')
  .eq('id', claim.id)
  .single()
```

3. Normalize `items` into all expected aliases:

```ts
{
  ...claim,
  ...fullClaim,
  items: claimItems,
  claimItems: claimItems,
  claim_items: claimItems
}
```

4. Check usage limits:

```ts
claimUsageService.checkClaimLimit(practiceId, claimAmount)
```

5. If the limit blocks submission, show a toast and stop.
6. If overage applies, store the pending claim and show `OverageChargeConfirmationModal`.
7. Otherwise open the modal:

```ts
setModalState({
  isOpen: true,
  mode: 'submit',
  claim: claimWithItems
});
```

### Entry Point B: Submit Generated Claim Result

The "Processing Results" card has a "Submit Claim" button:

```tsx
onClick={() => handleSubmitClaimData(result)}
```

`handleSubmitClaimData(claimData)` runs similar gating:

1. Determine claim amount from `claimData.totalAmount`.
2. Check usage limits with `claimUsageService.checkClaimLimit`.
3. Show upgrade toast if blocked.
4. Show overage confirmation if needed.
5. Open:

```ts
setModalState({
  isOpen: true,
  mode: 'submit',
  claim: claimData
});
```

### Entry Point C: Submit From Inside View Modal

`BillingClaims.tsx` renders:

```tsx
<UnifiedClaimModal
  isOpen={modalState.isOpen}
  claim={modalState.claim}
  mode={modalState.mode}
  onSubmit={async (claim) => {
    setModalState(prev => ({ ...prev, mode: 'submit', claim: claim }));
  }}
  onSubmissionComplete={handleSubmissionComplete}
/>
```

If the user opens a claim in `view` mode and clicks submit inside the modal, the page switches that same modal to `mode: 'submit'`.

## 3. Overage Gate Before Modal Submission

Before the modal performs the MediKredit sequence, the page checks subscription/usage:

```ts
const limitCheck = await claimUsageService.checkClaimLimit(practiceId, claimAmount);
```

Expected result shape used by the page:

```ts
{
  canSubmit: boolean;
  reason?: string;
  isOverage?: boolean;
  chargeAmount?: number;
}
```

If `isOverage` is true:

```ts
setOverageChargeAmount(limitCheck.chargeAmount);
setPendingClaimSubmission(claimWithItems);
setShowOverageModal(true);
```

When the user confirms:

```ts
setModalState({
  isOpen: true,
  mode: 'submit',
  claim: pendingClaimSubmission
});
```

## 4. Modal Auto-Starts the Stepper

`UnifiedClaimModal` watches for:

```ts
if (!isOpen || !claim || mode !== 'submit') return;
```

Then it initializes these visible steps:

| Step ID | UI label | Description |
| --- | --- | --- |
| `validate` | Validate Claim | Validating claim data and required fields |
| `generate_xml` | Generate XML 3.53 | Creating Medikredit-compliant XML payload |
| `encrypt_data` | Encrypt Data | Securing sensitive patient information |
| `submit_claim` | Submit to Medikredit / Submit for Real-time Adjudication | Sending claim to Medikredit API |
| `parse_response` | Parse Response | Processing Medikredit XML response |
| `update_database` | Update Database | Saving submission results and Jiffy number |

Then it immediately calls:

```ts
void handleStartSubmission();
```

## 5. Step 1: `validate`

### Visible step behavior

`handleStartSubmission` marks the step in progress:

```ts
updateStepStatus('validate', 'in_progress');
```

It performs basic modal-level checks:

```ts
const hasPatientData = claim.patient_id || claim.patientData;
const hasItems = claim.claim_items && claim.claim_items.length > 0;

if (!hasPatientData) throw new Error('Invalid claim data: missing patient information');
if (!hasItems) throw new Error('Invalid claim data: missing claim items');
```

If valid:

```ts
updateStepStatus('validate', 'completed', 'Claim validation passed');
setProgress(16);
```

### Deeper validation later in this same submission

The simple visible validation is not the only validation. The real provider/patient/item validation happens inside `submitToMedikredit`.

That deeper validation:

1. Loads `medikredit_providers` by `practice_id`.
2. Normalizes provider settings.
3. Loads/decrypts patient data if only `patient_id` is present.
4. Normalizes patient data.
5. Validates patient data.
6. Validates claim items and provider fields.

Request to Supabase for provider settings:

```ts
supabase
  .from('medikredit_providers')
  .select('*')
  .eq('practice_id', claimPracticeId)
  .maybeSingle()
```

Request to Supabase for patient data when needed:

```ts
supabase
  .from('patients')
  .select('*')
  .eq('id', claim.patient_id)
  .single()
```

Provider fields expected by validation:

```ts
{
  providerName: string;
  bhfNumber: string;
  hpcNumber: string;
  groupPracticeNumber: string;
  vendorId: string;
  pcNumber: string;
  worksNumber: string;
  prescriberAccountNumber: string;
  placeOfServiceCode: string;
}
```

Patient fields expected by validation:

```ts
{
  member_id: string;
  member_surname: string;
  member_initials: string;
  id_number: string;
  date_of_birth: string;
  medical_scheme_option_code: string;
  dependent_code: string;
}
```

Claim item validation checks:

- at least one item exists;
- each item has description, quantity, price;
- dates are `CCYYMMDD`;
- times are `HHMMSS`;
- ICD-10 codes are present and valid;
- procedure lines have procedure codes;
- medication lines have valid NAPPI, daily dose, days supply;
- modifier lines have valid modifier codes and parent procedure references.

## 6. Step 2: `generate_xml`

### Visible step behavior

The visible step marks XML generation complete before the actual XML is generated:

```ts
updateStepStatus('generate_xml', 'in_progress');
updateStepStatus('generate_xml', 'completed', 'Generated XML payload');
setProgress(32);
```

The real XML generation happens during Step 4 inside:

```ts
submitToMedikredit("")
  -> medikreditClaimService.submitClaim(...)
```

### Real XML generation logic

`MediKreditClaimService.submitClaim` builds:

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:s2pi="http://www.medikredit.co.za/S2PI">
  <soapenv:Header/>
  <soapenv:Body>
    <s2pi:submit-claim>
      <request>
        &lt;?xml version=&quot;1.0&quot; encoding=&quot;UTF-8&quot; standalone=&quot;yes&quot;?&gt;
        &lt;DOCUMENT version=&quot;3.53&quot; reply_tp=&quot;1&quot;&gt;
        ...
        &lt;/DOCUMENT&gt;
      </request>
    </s2pi:submit-claim>
  </soapenv:Body>
</soapenv:Envelope>
```

The frontend creates this envelope for its own service abstraction, but it does not send this full envelope to MediKredit directly. Before calling the local backend, `MedikreditService.sendSOAPRequest` extracts only the inner decoded `<DOCUMENT>...</DOCUMENT>`.

### Claim XML core structure

The inner XML sent to the backend is shaped like:

```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<DOCUMENT version="3.53" reply_tp="1">
  <TX
    sp_bhf="{provider BHF}"
    sp_hpc="{provider HPC}"
    grp_prac="{group practice number}"
    tx_nbr="{transaction number}"
    plan="{patient medical_scheme_option_code}"
    dt_cr="{current date CCYYMMDD}"
    dt_os="{service date CCYYMMDD}"
    tx_cd="21"
    nbr_items="{item count}"
    clm_orig="E"
    msg_fmt="13"
    orig="{03 for medication claim, 04 for procedure-only claim}"
    bin="2"
    cntry_cd="ZA"
    sect_cd="PR"
    pay_adv="P">
    <VEND vend_id="{vendorId}" pc_nbr="{pcNumber}" wks_nbr="{worksNumber}" vend_ver="1"/>
    <MEM ch_id="{member_id}" sname="{member_surname}" inits="{member_initials}" mbr_ent="{member name}"/>
    <PAT .../>
    <DOCTOR auth_nbr="" mem_acc_nbr="{prescriber account}" plcsv_cd="{place of service}" disp_cd="01"/>
    <FIN gross="{total claim amount}"/>
    <ITEM ...>...</ITEM>
  </TX>
</DOCUMENT>
```

### Item XML structure

Procedure item:

```xml
<ITEM lin_num="1" pay_adv="P" tp="2" cdg_set="02" descr="{description}" process_tp="01">
  <PROC tar_cd="{procedureCode}" qty="{quantity}" units="{quantity}" unit_tp="06">
    <TRMNT st_dt="{startDate}" st_tm="{startTime}" end_dt="{endDate}" end_tm="{endTime}"/>
  </PROC>
  <DIAG stg_ind="01" cd="{ICD10}"/>
  <ADD_BHF tp_ind="1" bhf_nbr="{provider BHF}" hpc_nbr="{provider HPC}"/>
  <FIN tar_ind="03" price="{price}" bs_of_cst="3" gross="{gross}"/>
</ITEM>
```

Medication item:

```xml
<ITEM lin_num="1" pay_adv="P" tp="1" cdg_set="03" descr="{description}" process_tp="01">
  <MED nappi_cd="{nappiCode}" dly_ds="{dailyDose}" est_days_sup="{daysSupply}" basis_of_eds="3" qty="{quantity}" mix_cd="0" subst_ind=" "/>
  <DIAG stg_ind="01" cd="{ICD10}"/>
  <ADD_BHF tp_ind="1" bhf_nbr="{provider BHF}" hpc_nbr="{provider HPC}"/>
  <FIN tar_ind="03" price="{price}" disp_fee="{dispensingFee}" bs_of_cst="3" gross="{gross}"/>
</ITEM>
```

Modifier item:

```xml
<ITEM lin_num="1" pay_adv="P" tp="3" cdg_set="02" descr="{description}" process_tp="01">
  <PROC>
    <MOD mod="{modifierCode}" qty="{quantity}" units="1" unit_tp="06"/>
    <TRMNT st_dt="{startDate}" st_tm="{startTime}" end_dt="{endDate}" end_tm="{endTime}"/>
  </PROC>
  <DIAG stg_ind="01" cd="{ICD10}"/>
  <ADD_BHF tp_ind="1" bhf_nbr="{provider BHF}" hpc_nbr="{provider HPC}"/>
  <FIN tar_ind="03" price="{price}" bs_of_cst="3" gross="{gross}"/>
</ITEM>
```

## 7. Step 3: `encrypt_data`

### Visible step behavior

The step displays:

```ts
updateStepStatus('encrypt_data', 'in_progress');
updateStepStatus('encrypt_data', 'completed', 'Patient data encrypted successfully');
setProgress(48);
```

### Actual current logic

There is no new outbound encryption operation performed at this step. The existing app security model is:

- patient records in Supabase are stored encrypted;
- when submission needs a patient row, `submitToMedikredit` reads the encrypted patient record;
- the record is decrypted locally through `decryptPatientData(patientRecord)`;
- the decrypted patient fields are normalized into the MediKredit XML shape;
- the browser sends the inner XML to the local backend over HTTP in local dev.

So this step is currently a UI/security checkpoint rather than an independent encryption request.

## 8. Step 4: `submit_claim`

This is the main step. It performs Medprax checks, builds the final MediKredit request, and submits to the backend proxy.

### 8.1 Start of step

Visible step code:

```ts
updateStepStatus('submit_claim', 'in_progress');
const medikreditResponse = await submitToMedikredit("");
updateStepStatus('submit_claim', 'completed', `Submitted successfully (Transaction ID: ${medikreditResponse.transactionId})`);
setProgress(64);
```

### 8.2 Load provider settings

Request:

```ts
supabase
  .from('medikredit_providers')
  .select('*')
  .eq('practice_id', claimPracticeId)
  .maybeSingle()
```

If no provider record exists, submission stops with:

```text
MediKredit provider settings are missing. Complete Settings > MediKredit before submitting claims.
```

Provider settings are normalized into:

```ts
{
  practiceId,
  providerName,
  bhfNumber,
  hpcNumber,
  groupPracticeNumber,
  vendorId,
  pcNumber,
  worksNumber,
  vendorVersion,
  prescriberAccountNumber,
  placeOfServiceCode
}
```

### 8.3 Create the MediKredit service

The modal calls:

```ts
const medikreditClaimService = await createMedikreditClaimService(claimPracticeId);
```

That service config contains:

```ts
{
  baseUrl: 'https://services.medikredit.co.za:4436',
  username: '<redacted>',
  password: '<redacted>',
  practiceId,
  vendorId: providerData.vendor_id || '2038',
  bhfNumber: providerData.bhf_number || '1438298',
  hpcNumber: providerData.hpc_number || '',
  groupPracticeNumber: providerData.group_practice_number || '1438298',
  pcNumber: providerData.pc_number || '01',
  worksNumber: providerData.works_number || '001'
}
```

Important: in the active proxy path, the frontend service config username/password are not the credentials used by the final outbound MediKredit HTTP request. The final outbound Basic auth is added on the backend from backend env variables.

### 8.4 Load and normalize patient data

If `claim.patientData` is missing or incomplete, the modal loads the patient:

```ts
supabase
  .from('patients')
  .select('*')
  .eq('id', claim.patient_id)
  .single()
```

Then:

```ts
fullPatientData = await decryptPatientData(patientRecord);
const patientData = normalizePatientForClaim(fullPatientData);
PatientDataConverter.validatePatientData(patientData);
```

Patient data sent forward into XML includes:

```ts
{
  name,
  date_of_birth,
  gender,
  id_number,
  country,
  medical_scheme_option_code,
  member_id,
  member_initials,
  member_surname,
  relationship_to_member,
  patient_status,
  dependent_code,
  newborn_indicator,
  postal_code
}
```

### 8.5 Medprax tariff contract request for procedure lines

For procedure items, the modal derives:

```ts
const disciplineCode =
  practiceData?.medpraxDisciplineCode ??
  practiceData?.medprax_discipline_code ??
  providerRecord?.medprax_discipline_code;

const planOptionCode = patientData.medical_scheme_option_code;
const tariffCodes = procedureItems.map(...);
```

Then it calls:

```ts
medpraxGetMedicalContracts({
  planOptionCode,
  disciplineCode,
  tariffCodes,
});
```

Frontend request to app backend:

```http
POST {LAMBDA_URL}/api/medprax/tariffs/contracts/medical
Content-Type: application/json
```

Body:

```json
{
  "planOptionCode": "631364",
  "disciplineCode": "016",
  "tariffCodes": ["0190", "0201"]
}
```

Current frontend timeout:

```ts
{ timeout: 20000 }
```

Backend request to Medprax:

```http
POST {MEDPRAX_TARIFFS_BASE_URL}/api/v{MEDPRAX_TARIFFS_API_VERSION}/contracts/medical/list
Authorization: Bearer {Medprax JWT}
Content-Type: application/json
X-Request-ID: {uuid}
Year: {MEDPRAX_TARIFF_YEAR}
```

Body:

```json
{
  "planOptionCode": "631364",
  "disciplineCode": "016",
  "tariffCodes": ["0190", "0201"]
}
```

Medprax credentials and config used by backend:

```env
MEDPRAX_EMAIL=<redacted>
MEDPRAX_PASSWORD=<redacted>
MEDPRAX_TARIFFS_UNIQUE_REFERENCE_HOST=MEDPRAX.TARIFF.API
MEDPRAX_TARIFFS_BASE_URL=https://tariffs.api.medprax.co.za
MEDPRAX_TARIFFS_API_VERSION=1
MEDPRAX_TARIFF_YEAR=2025
MEDPRAX_TIMEOUT_MS=15000
MEDPRAX_MAX_RETRIES=2
```

The contract result is used to create `contractPriceByCode`. If a matching tariff code has a `unitPrice`, that price overrides the claim-entered price during item normalization.

### 8.6 Medprax NAPPI request for medication lines

For medication lines, the modal collects unique NAPPI values and tries candidate formats:

```ts
[
  trimmed,
  digitsOnly,
  digitsOnly.padStart(6, '0'),
  digitsOnly.padStart(7, '0'),
  digitsOnly.padStart(8, '0')
]
```

For each candidate:

```ts
medpraxGetMedicineByNappi({ nappiCode: candidate });
```

Frontend request:

```http
POST {LAMBDA_URL}/api/medprax/medicines/by-nappi
Content-Type: application/json
```

Body:

```json
{
  "nappiCode": "0249561"
}
```

Current frontend timeout:

```ts
{ timeout: 15000 }
```

Backend Medprax product lookup ultimately calls:

```http
POST {MEDPRAX_PRODUCTS_BASE_URL}/api/v{MEDPRAX_PRODUCTS_API_VERSION}/medicines/search/{page}/{pageSize}
Authorization: Bearer {Medprax JWT}
Content-Type: application/json
X-Request-ID: {uuid}
```

Body shape:

```json
{
  "filters": [
    { "propertyName": "Name", "operation": "Contains", "value": "0249561" },
    { "propertyName": "NappiCode", "operation": "Contains", "value": "0249561" },
    { "propertyName": "Code", "operation": "Contains", "value": "0249561" },
    { "propertyName": "FullDescription", "operation": "Contains", "value": "0249561" }
  ],
  "filterJoin": "Or",
  "ascendingOrder": true,
  "sortKey": "Name"
}
```

Medprax credentials and config used by backend:

```env
MEDPRAX_EMAIL=<redacted>
MEDPRAX_PASSWORD=<redacted>
MEDPRAX_PRODUCTS_UNIQUE_REFERENCE_HOST=MEDPRAX.PRODUCT.API
MEDPRAX_PRODUCTS_BASE_URL=https://products.api.medprax.co.za
MEDPRAX_PRODUCTS_API_VERSION=1
MEDPRAX_TIMEOUT_MS=15000
MEDPRAX_MAX_RETRIES=2
```

### 8.7 Medprax auth request structure

Before Medprax product/tariff calls, backend auth obtains a JWT.

Current email-login structure:

```http
POST {MEDPRAX_AUTH_BASE_URL}/api/v{MEDPRAX_AUTH_API_VERSION}/authenticate/login/email
Content-Type: application/json
```

Body:

```json
{
  "uniqueReferenceHost": "MEDPRAX.TARIFF.API",
  "email": "<MEDPRAX_EMAIL>",
  "password": "<MEDPRAX_PASSWORD>"
}
```

For products, `uniqueReferenceHost` is `MEDPRAX.PRODUCT.API`.

For schemes, `uniqueReferenceHost` is `MEDPRAX.SCHEME.API`.

Refresh structure:

```http
PATCH {MEDPRAX_AUTH_BASE_URL}/api/v{MEDPRAX_AUTH_API_VERSION}/authenticate/refresh/jwtoken
Content-Type: application/json
```

Body:

```json
{
  "token": "{current access token}",
  "refreshToken": "{refresh token}"
}
```

### 8.8 Normalize claim items before MediKredit

The modal calls:

```ts
const claimItems = normalizeClaimItems(rawClaimItems, contractPriceByCode).map((item) => ({
  ...item,
  diagnosisCodes: cleanDiagnosisCodes(item.diagnosisCodes),
}));
```

Normalized item shape:

```ts
{
  lineNumber: number;
  itemType: 'procedure' | 'medication' | 'modifier';
  isModifier: boolean;
  modifierCode?: string;
  parentLineNumber?: number;
  procedureCode: string;
  nappiCode?: string;
  quantity: number;
  unitType: '06';
  description: string;
  price: number;
  startDate: string; // CCYYMMDD
  startTime: string; // HHMMSS
  endDate: string;   // CCYYMMDD
  endTime: string;   // HHMMSS
  diagnosisCodes: string[];
  dailyDose?: number;
  estimatedDaysSupply?: number;
  dispensingFee?: number;
}
```

### 8.9 Duplicate submission check

The modal creates:

```ts
const submissionFingerprint = createSubmissionFingerprint({
  practiceId: claimPracticeId,
  provider: normalizedProvider,
  patient: patientData,
  items: claimItems,
});
```

If `claim.patient_id` exists, it checks recent claims:

```ts
supabase
  .from('claims')
  .select('id, status, medikredit_response, created_at')
  .eq('practice_id', claimPracticeId)
  .eq('patient_id', claim.patient_id)
  .gte('created_at', duplicateWindowStart)
  .limit(30)
```

If a recent claim has the same `submissionFingerprint` and status in `submitted`, `approved`, `pending_review`, or `partially_approved`, submission is blocked.

### 8.10 Split procedure and medication claims

The modal calls:

```ts
const split = ClaimSplitterService.analyzeAndSplit(
  claimItems,
  `CLM${Date.now()}`
);
```

If split is needed:

- procedure items are submitted under `split.procedureTxNbr`;
- medication items are submitted under `split.medicineTxNbr`;
- responses are merged.

Medication submissions can retry with chronic plan option `631364` when MediKredit returns rejection code `342` or text saying to use the chronic option.

### 8.11 Frontend request to local MediKredit backend

`MediKreditClaimService.submitClaim` calls:

```ts
this.sendSOAPRequest(xmlPayload, 'submit-claim')
```

`MedikreditService.sendSOAPRequest` extracts the inner XML:

```ts
const innerXmlMatch = xmlPayload.match(/<request>(.*?)<\/request>/s);
const innerXml = innerXmlMatch[1]
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');
```

Then it sends JSON:

```http
POST {VITE_LOCAL_MEDIKREDIT_PROXY_URL || "http://localhost:3001"}/api/medikredit
Content-Type: application/json
```

Body:

```json
{
  "action": "claim",
  "xmlData": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><DOCUMENT version=\"3.53\" reply_tp=\"1\">...</DOCUMENT>",
  "claimId": "TX{timestamp}{random}",
  "patientId": "{practiceId from service config}",
  "practiceId": "{practiceId from service config}"
}
```

Current browser timeout for this request:

```ts
AbortSignal.timeout(130_000)
```

Important: `xmlData` is raw inner MediKredit `<DOCUMENT>` XML. It is not the full SOAP envelope.

### 8.12 Backend request to MediKredit with username/password

The backend route is:

```http
POST /api/medikredit
Content-Type: application/json
```

The backend reads:

```js
const MEDIKREDIT_API_URL = process.env.MEDIKREDIT_API_URL || 'https://services.medikredit.co.za:4436';
const MEDIKREDIT_USERNAME = process.env.MEDIKREDIT_USERNAME || '<redacted default>';
const MEDIKREDIT_PASSWORD = process.env.MEDIKREDIT_PASSWORD || '<redacted default>';
```

It calls:

```js
sendMedikreditSoap({
  xmlData,
  action,
  apiUrl: MEDIKREDIT_API_URL,
  username: MEDIKREDIT_USERNAME,
  password: MEDIKREDIT_PASSWORD,
  timeoutMs: Number(process.env.MEDIKREDIT_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
});
```

`sendMedikreditSoap` creates this final outbound SOAP request:

```http
POST {MEDIKREDIT_API_URL}
Content-Type: text/xml; charset=utf-8
SOAPAction: submit-claim
Authorization: Basic base64("{MEDIKREDIT_USERNAME}:{MEDIKREDIT_PASSWORD}")
```

Body:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:s2pi="http://www.medikredit.co.za/S2PI">
  <soapenv:Header/>
  <soapenv:Body>
    <s2pi:submit-claim>
      <request>
        &lt;DOCUMENT version=&quot;3.53&quot; reply_tp=&quot;1&quot;&gt;...&lt;/DOCUMENT&gt;
      </request>
    </s2pi:submit-claim>
  </soapenv:Body>
</soapenv:Envelope>
```

Backend timeout:

```env
MEDIKREDIT_REQUEST_TIMEOUT_MS=120000
```

Default when absent:

```ts
120000
```

On timeout, the backend returns:

```http
HTTP/1.1 504 Gateway Timeout
Content-Type: application/json
```

```json
{
  "error": "MediKredit gateway timeout or blocked egress",
  "code": "MEDIKREDIT_TIMEOUT",
  "details": "MediKredit request timed out ...",
  "source": "xAI Proxy with Medikredit Integration",
  "lambda_ip": "3.224.6.92"
}
```

## 9. Step 5: `parse_response`

### Visible step behavior

After Step 4 returns:

```ts
updateStepStatus('parse_response', 'in_progress');
const parsedResponse = parseMedikreditResponse(medikreditResponse);
updateStepStatus('parse_response', 'completed', `Response parsed: ${parsedResponse.responseMessage}`);
setProgress(80);
```

### Response shape returned from `submitToMedikredit`

`submitToMedikredit` returns:

```ts
{
  success: response.status === 'approved',
  transactionId: response.transactionId || response.claimNumber,
  responseCode: response.responseCode,
  responseMessage: response.message,
  xmlResponse: response.rawResponse,
  approvedAmount: response.approvedAmount,
  patientResponsibility: response.patientLiability,
  denialReason: response.rejectionReason,
  healthNetworkId: response.healthNetworkId,
  rejectionCode: response.rejectionCode,
  rejectionDescription: response.rejectionDescription,
  responseDate: response.responseDate,
  responseTime: response.responseTime,
  authorizationNumber: response.authorizationNumber,
  remittanceMessages: response.remittanceMessages,
  itemStatuses: response.itemStatuses,
  submissionFingerprint,
  validationSnapshot: submissionValidation.snapshot,
  validationWarnings: combinedWarnings
}
```

### XML parsing inside `MedikreditService.sendSOAPRequest`

The frontend parser reads:

- `TX.res`;
- `TX.tx_nbr`;
- `TX.dt`;
- `TX.tm`;
- claim-level `RJ.cd` and `RJ.desc`;
- `AUTHS.hnet`;
- `AUTHS.auth_nbr`;
- claim-level `FIN`;
- item-level `ITEM`;
- item-level `FIN`;
- item-level `RJ`;
- `RMR` and `WARN`.

### Final parsed modal result

`parseMedikreditResponse` maps the result to:

```ts
{
  success: boolean;
  transactionId?: string;
  responseCode?: string;
  responseMessage?: string;
  denialReason?: string;
  approvedAmount: number;
  patientResponsibility: number;
  healthNetworkId?: string;
  rejectionCode?: string;
  rejectionDescription?: string;
  responseDate?: string;
  responseTime?: string;
  authorizationNumber?: string;
  remittanceMessages: any[];
  itemStatuses: any[];
  xmlResponse?: string;
  submissionFingerprint?: string;
  validationSnapshot?: any;
  validationWarnings: string[];
}
```

Status derivation:

- `responseCode === "R"` -> `rejected`;
- any rejected item with overall approval or money paid -> `partially_approved`;
- `responseCode === "A"` -> `approved`;
- `responseCode === "P"` and fully covered -> `approved`;
- `responseCode === "P"` otherwise -> `pending_review`;
- fallback to `response.success ? approved : rejected`.

## 10. Step 6: `update_database`

### Visible step behavior

```ts
updateStepStatus('update_database', 'in_progress');
const persistedClaim = await updateClaimInDatabase(claim.id, parsedResponse);
updateStepStatus('update_database', 'completed', 'Database updated successfully');
setProgress(100);
```

### Existing claim update

For an existing claim, the modal updates Supabase:

```ts
supabase
  .from('claims')
  .update({
    status,
    medikredit_response: result,
    amount_paid: amountPaid,
    payment_amount: amountPaid,
    member_liability: memberLiability,
    patient_responsibility: memberLiability,
    total_amount: result.approvedAmount ? (result.approvedAmount + memberLiability) : undefined,
    date_of_response: new Date().toISOString(),
    date_of_submission: new Date().toISOString(),
    denial_reason: result.denialReason || result.rejectionDescription,
    updated_at: new Date().toISOString()
  })
  .eq('id', claimId)
  .select()
  .single()
```

### Temporary claim insert

If the claim id starts with `temp-`, the modal inserts a new claim:

```ts
supabase
  .from('claims')
  .insert({
    patient_id: claim.patient_id,
    practice_id: claim.practice_id || practiceId,
    status,
    total_amount: claim.total_amount || 0,
    amount_claimed: claim.total_amount || 0,
    patient_responsibility: memberLiability,
    member_liability: memberLiability,
    payment_amount: amountPaid,
    amount_paid: amountPaid,
    medikredit_response: result,
    date_of_response: new Date().toISOString(),
    date_of_submission: new Date().toISOString(),
    denial_reason: result.denialReason || result.rejectionDescription,
    items: claim.claim_items || [],
    created_at: claim.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  .select()
  .single()
```

## 11. Completion Callback Back to `BillingClaims.tsx`

After all modal steps complete:

```ts
onSubmissionComplete({
  ...parsedResponse,
  status: deriveSubmissionStatus(parsedResponse),
  medikredit_response: { ...parsedResponse },
  claimId: (persistedClaim || updatedClaim).id,
});
```

`BillingClaims.tsx` receives this in:

```ts
handleSubmissionComplete(result)
```

It then:

1. increments usage:

```ts
claimUsageService.incrementClaimUsage(practiceId)
```

2. creates overage charge if one was confirmed:

```ts
claimChargeService.createCharge({
  practiceId,
  claimId: modalState.claim?.id,
  claimAmount,
  chargeAmount: overageChargeAmount
});
```

3. updates local modal state to response mode:

```ts
setModalState(prev => ({
  ...prev,
  mode: 'response',
  claim: {
    ...prev.claim,
    status: newStatus,
    total_amount,
    patient_responsibility,
    medikredit_response: normalizedMedikreditResponse
  }
}));
```

4. refreshes the claims list:

```ts
await fetchClaims(practiceId);
setLastRefresh(Date.now());
```

## 12. Exact Request Summary

### A. Supabase provider settings

```http
SELECT * FROM medikredit_providers WHERE practice_id = {claimPracticeId}
```

Used to populate:

- provider BHF;
- HPC;
- group practice number;
- vendor id;
- PC number;
- works number;
- prescriber account number;
- place of service;
- Medprax discipline code.

### B. Supabase patient fetch

```http
SELECT * FROM patients WHERE id = {claim.patient_id}
```

Only used when `claim.patientData` is missing/incomplete.

### C. Medprax tariff validation

```http
POST {LAMBDA_URL}/api/medprax/tariffs/contracts/medical
Content-Type: application/json
```

```json
{
  "planOptionCode": "{patient medical scheme option}",
  "disciplineCode": "{provider/practice discipline}",
  "tariffCodes": ["{procedureCode}"]
}
```

Backend then uses Medprax JWT auth and `Year` header.

### D. Medprax medication validation

```http
POST {LAMBDA_URL}/api/medprax/medicines/by-nappi
Content-Type: application/json
```

```json
{
  "nappiCode": "{candidate NAPPI}"
}
```

Backend then uses Medprax JWT auth.

### E. Browser to local MediKredit proxy

```http
POST {VITE_LOCAL_MEDIKREDIT_PROXY_URL || "http://localhost:3001"}/api/medikredit
Content-Type: application/json
```

```json
{
  "action": "claim",
  "xmlData": "<DOCUMENT version=\"3.53\" reply_tp=\"1\">...</DOCUMENT>",
  "claimId": "TX{timestamp}{random}",
  "patientId": "{practiceId}",
  "practiceId": "{practiceId}"
}
```

Timeout:

```text
130000 ms
```

### F. Backend to MediKredit

```http
POST {MEDIKREDIT_API_URL}
Content-Type: text/xml; charset=utf-8
SOAPAction: submit-claim
Authorization: Basic base64("{MEDIKREDIT_USERNAME}:{MEDIKREDIT_PASSWORD}")
```

Backend env:

```env
MEDIKREDIT_API_URL=https://services.medikredit.co.za:4436
MEDIKREDIT_USERNAME=<redacted>
MEDIKREDIT_PASSWORD=<redacted>
MEDIKREDIT_REQUEST_TIMEOUT_MS=120000
```

Body:

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:s2pi="http://www.medikredit.co.za/S2PI">
  <soapenv:Header/>
  <soapenv:Body>
    <s2pi:submit-claim>
      <request>&lt;DOCUMENT version=&quot;3.53&quot; reply_tp=&quot;1&quot;&gt;...&lt;/DOCUMENT&gt;</request>
    </s2pi:submit-claim>
  </soapenv:Body>
</soapenv:Envelope>
```

Timeout:

```text
120000 ms by default
```

## 13. Loading Screen Failure Points

If another app is stuck on loading while the backend receives requests, compare these points:

1. The other app must transition out of loading on HTTP `504`, HTTP non-OK, and `AbortError`.
2. The browser timeout should be at least `130000 ms` if it mirrors this app.
3. The backend-to-MediKredit timeout should be explicit, currently `120000 ms`.
4. The backend egress IP must be accepted by MediKredit.
5. The request to `/api/medikredit` must send inner `<DOCUMENT>` XML, not a full SOAP envelope.
6. If the other app skips Medprax checks, it must still send valid tariff codes, valid NAPPIs, valid ICD-10s, valid dates, and complete provider settings.
7. If the claim has several medications, Medprax NAPPI verification can run sequentially before the MediKredit request starts.

## 14. Security Note

Do not place real MediKredit or Medprax credentials in frontend code or Markdown docs.

Use this structure in code:

```env
MEDIKREDIT_USERNAME=...
MEDIKREDIT_PASSWORD=...
MEDPRAX_EMAIL=...
MEDPRAX_PASSWORD=...
```

But keep actual values in backend-only environment variables or a secret manager.
