import { grantedFacilityIds } from "@asc/authz";
import { API_ROUTE_PATTERNS } from "@asc/config";
import type { Room, WhiteboardBoard, WhiteboardCard } from "@asc/types";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { capabilityAtResource } from "../auth/route-auth.js";

const DEFAULT_ROOMS: readonly Room[] = [
  { id: "room-1", name: "Room 1", status: "idle" },
  { id: "room-2", name: "Room 2", status: "idle" },
  { id: "room-3", name: "Room 3", status: "idle" },
  { id: "room-4", name: "Room 4", status: "idle" },
];

function resolveFacilityId(
  request: FastifyRequest,
  preferredFacilityId?: string,
): string | undefined {
  if (preferredFacilityId !== undefined && preferredFacilityId.trim() !== "") {
    return preferredFacilityId.trim();
  }
  const headerValue = request.headers["x-facility-id"];
  if (typeof headerValue === "string" && headerValue.trim() !== "") {
    return headerValue.trim();
  }
  if (request.principal !== undefined) {
    const granted = grantedFacilityIds(request.principal);
    if (granted.length > 0) return granted[0];
  }
  return undefined;
}

export function whiteboardRoutes(app: FastifyInstance): Promise<void> {
  // GET /whiteboard — Today's case whiteboard with server-side TV minimization
  app.get(
    API_ROUTE_PATTERNS.whiteboard,
    { config: capabilityAtResource("schedule.read") },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { mode?: string; facilityId?: string };
      const facilityId = resolveFacilityId(request, query.facilityId);

      if (!facilityId) {
        return reply.code(400).send({
          code: "facility_required",
          message: "Facility context is required to view the whiteboard",
        });
      }

      if (!(await app.guards.requireCapabilityAt(request, reply, "schedule.read", facilityId))) {
        return reply;
      }

      const isTvMode = query.mode === "tv";

      // Query appointments for today in this facility
      const todayDate = new Date().toISOString().slice(0, 10);
      const facilityAccountRef = `Organization/${facilityId}`;

      const appointments = await request.medplum.searchResources("Appointment", {
        _count: "100",
      });

      const filteredAppointments = appointments.filter((appItem) => {
        const matchesFacility = appItem.meta?.accounts?.some(
          (account) => account.reference === facilityAccountRef,
        );
        const matchesDate = appItem.start ? appItem.start.startsWith(todayDate) : true;
        return matchesFacility && matchesDate;
      });

      const cards: WhiteboardCard[] = filteredAppointments.map((appItem) => {
        const roomRef = appItem.participant?.find((p) => p.actor?.reference?.startsWith("Location/"));
        const roomId = roomRef?.actor?.reference ? roomRef.actor.reference.replace("Location/", "") : "room-1";

        const patientRef = appItem.participant?.find((p) => p.actor?.reference?.startsWith("Patient/"));
        const patientId = patientRef?.actor?.reference ? patientRef.actor.reference.replace("Patient/", "") : "P";
        const initials = patientId.slice(0, 2).toUpperCase();

        const docRef = appItem.participant?.find((p) => p.actor?.reference?.startsWith("Practitioner/"));
        const surgeonInitials = docRef?.actor?.reference
          ? docRef.actor.reference.replace("Practitioner/", "").slice(0, 2).toUpperCase()
          : "";

        const card: WhiteboardCard = {
          caseId: appItem.id ?? "case-unknown",
          caseNumber: appItem.id ? `CASE-${appItem.id.slice(0, 6)}` : "CASE-000000",
          initials,
          phase: "SCHEDULED",
          roomId,
          procedureLabel: isTvMode ? "" : (appItem.description ?? "GI Procedure"),
          scheduledStart: appItem.start ?? new Date().toISOString(),
          phaseEnteredAt: appItem.start,
          surgeonInitials: isTvMode ? "" : surgeonInitials,
          flags: isTvMode ? [] : [],
        };

        return card;
      });

      const board: WhiteboardBoard = {
        generatedAt: new Date().toISOString(),
        rooms: DEFAULT_ROOMS,
        cards,
      };

      return reply.code(200).send(board);
    },
  );

  return Promise.resolve();
}
