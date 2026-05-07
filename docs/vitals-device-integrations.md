# Vitals and device integrations

This document summarizes how practices typically connect clinical devices (BP cuffs, pulse oximeters, scales, glucometers) to software, and how Fleming can evolve toward live capture.

## Options

1. **Web Bluetooth (BLE)**  
   Chromium-based browsers can pair with BLE GATT devices after a user gesture. Many consumer cuffs use proprietary services; standard profiles exist for some glucose and BP devices. Suitable for lightweight browser workflows; requires HTTPS and explicit user permission per session.

2. **Vendor mobile SDKs and bridges**  
   Manufacturers (e.g. Omron, Withings, Nonin) often ship iOS/Android SDKs or companion apps that sync to cloud APIs. A desktop or web EMR integrates via those vendor HTTPS APIs or by receiving exports (FHIR, CSV) from a bridge app.

3. **Apple HealthKit**  
   On iOS, HealthKit aggregates data from watches, scales, and connected apps. Integration is native; data can be exported to a backend via your app’s sync pipeline.

4. **USB / serial / docked hubs**  
   Common in wards and labs: RS-232 or USB HID with a local agent (Electron, native helper) that forwards readings to the server. Continua Health Alliance profiles apply to some device classes.

5. **FHIR R4 Device / Observation**  
   Enterprise stacks often expose devices and vitals as FHIR resources. Fleming can ingest `Observation` bundles from a hospital integration engine or regional HIE.

6. **Manual entry**  
   Always supported: clinicians enter vitals in the canvas or sidebar; encrypted into `clinical_encounters` state.

## UI catalog

The clinical sidebar **Devices & integrations** section lists representative hardware and typical connection paths. Pairing is not enabled until a transport is implemented and validated for your deployment.
