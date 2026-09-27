import { caseHandlers } from "./cases";
import { centerHandlers } from "./center";
import { noteHandlers } from "./note";
import { patientHandlers } from "./patients";
import { postProcedureHandlers } from "./post-procedure";

/** Every @asc/api-client clinical call, answered from the in-memory demo DB (../../db). */
export const clinicalHandlers = [
  ...patientHandlers,
  ...caseHandlers,
  ...noteHandlers,
  ...postProcedureHandlers,
  ...centerHandlers,
];
