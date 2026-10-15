import type { Consent, Extension } from "@medplum/fhirtypes";
import { facilityMeta, fhirId, instant, reference, text } from "@asc/fhir/builders/common";
import { type FhirUrls, fhirUrls } from "@asc/fhir/urls";

/**
 * Pure TypeScript SHA-256 implementation without Node built-in imports,
 * preserving package purity for isomorphic browser/server usage.
 */
export function sha256Hex(asciiOrUtf8: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  let utf8 = "";
  for (let i = 0; i < asciiOrUtf8.length; i++) {
    const code = asciiOrUtf8.charCodeAt(i);
    if (code < 128) {
      utf8 += String.fromCharCode(code);
    } else if (code < 2048) {
      utf8 += String.fromCharCode((code >> 6) | 192, (code & 63) | 128);
    } else {
      utf8 += String.fromCharCode((code >> 12) | 224, ((code >> 6) & 63) | 128, (code & 63) | 128);
    }
  }

  const bitLength = utf8.length * 8;
  const words: number[] = [];
  for (let i = 0; i < utf8.length; i++) {
    words[i >> 2] = (words[i >> 2] ?? 0) | ((utf8.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8));
  }
  words[bitLength >> 5] = (words[bitLength >> 5] ?? 0) | (0x80 << (24 - (bitLength % 32)));
  words[(((bitLength + 64) >> 9) << 4) + 15] = bitLength;

  const w: number[] = Array.from({ length: 64 }, () => 0);
  for (let i = 0; i < words.length; i += 16) {
    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;

    for (let j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = (words[i + j] ?? 0) | 0;
      } else {
        const gamma0 = rightRotate(w[j - 15]!, 7) ^ rightRotate(w[j - 15]!, 18) ^ (w[j - 15]! >>> 3);
        const gamma1 = rightRotate(w[j - 2]!, 17) ^ rightRotate(w[j - 2]!, 19) ^ (w[j - 2]! >>> 10);
        w[j] = (((w[j - 16]! + gamma0) | 0) + ((w[j - 7]! + gamma1) | 0)) | 0;
      }

      const ch = (e & f) ^ (~e & g);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const t1 = (((((h + sigma1) | 0) + ((ch + k[j]!) | 0)) | 0) + (w[j]! | 0)) | 0;
      const t2 = (sigma0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    hash[0] = (hash[0]! + a) | 0;
    hash[1] = (hash[1]! + b) | 0;
    hash[2] = (hash[2]! + c) | 0;
    hash[3] = (hash[3]! + d) | 0;
    hash[4] = (hash[4]! + e) | 0;
    hash[5] = (hash[5]! + f) | 0;
    hash[6] = (hash[6]! + g) | 0;
    hash[7] = (hash[7]! + h) | 0;
  }

  let result = "";
  for (let i = 0; i < 8; i++) {
    result += (hash[i]! >>> 0).toString(16).padStart(8, "0");
  }
  return result;
}

export interface ConsentResourceInput {
  readonly facilityId: string;
  readonly patientId: string;
  readonly caseId: string;
  readonly procedureName: string;
  readonly procedureCode: string;
  readonly performingPhysicianName: string;
  readonly signerName: string;
  readonly signerRelationship: "patient" | "legal_guardian" | "healthcare_proxy";
  readonly signatureDataUrl: string;
  readonly consentFormVersion: string;
  readonly dateTime?: string;
  readonly signatureHash?: string;
}

/**
 * Builds a FHIR R4 Consent resource for digital informed consent.
 * Stores procedure details and cryptographic SHA-256 signature attestation hash in extensions.
 */
export function buildConsentResource(input: ConsentResourceInput, urls: FhirUrls = fhirUrls): Consent {
  const facility = fhirId(input.facilityId, "facility id");
  const patient = fhirId(input.patientId, "patient id");
  const encounter = fhirId(input.caseId, "case id");

  const sigHash = input.signatureHash ?? sha256Hex(input.signatureDataUrl);
  const now = input.dateTime !== undefined ? instant(input.dateTime, "consent dateTime") : new Date().toISOString();

  const extensions: Extension[] = [
    {
      url: urls.structureDefinition("signature-hash"),
      valueString: sigHash,
    },
    {
      url: urls.structureDefinition("consent-form-version"),
      valueString: text(input.consentFormVersion, "consentFormVersion", 50),
    },
    {
      url: urls.structureDefinition("signer-relationship"),
      valueString: input.signerRelationship,
    },
    {
      url: urls.structureDefinition("case-reference"),
      valueReference: reference("Encounter", encounter, "case reference"),
    },
    {
      url: urls.structureDefinition("procedure-code"),
      valueString: text(input.procedureCode, "procedureCode", 50),
    },
    {
      url: urls.structureDefinition("procedure-name"),
      valueString: text(input.procedureName, "procedureName", 200),
    },
    {
      url: urls.structureDefinition("performing-physician"),
      valueString: text(input.performingPhysicianName, "performingPhysicianName", 150),
    },
  ];

  return {
    resourceType: "Consent",
    meta: facilityMeta(facility),
    status: "active",
    scope: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/consentscope",
          code: "treatment",
          display: "Treatment",
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: "http://loinc.org",
            code: "59284-0",
            display: "Consent Document",
          },
        ],
      },
    ],
    patient: reference("Patient", patient),
    dateTime: now,
    performer: [
      {
        display: text(input.signerName, "signerName", 150),
      },
    ],
    organization: [reference("Organization", facility)],
    extension: extensions,
  };
}
