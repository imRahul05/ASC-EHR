"use client";

import { CheckCircle2, AlertCircle, Clock, MapPin, Phone, Car } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@asc/ui";
import { useAuth } from "../../../hooks/use-auth";
import { useDashboardData } from "../../../hooks/use-dashboard-data";

export function PatientView() {
  const { user } = useAuth();
  const { cases } = useDashboardData();
  const patientCase = cases[0];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Welcome & Procedure Summary Banner */}
      <Card className="border-border/70 shadow-xs bg-card">
        <CardHeader className="p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardDescription className="text-xs uppercase font-mono tracking-wider">
                Patient Portal
              </CardDescription>
              <CardTitle className="text-xl font-bold tracking-tight">
                Welcome, {user?.fullName ?? "Robert Miller"}
              </CardTitle>
            </div>
            <Badge variant="default" className="text-xs font-mono self-start sm:self-auto">
              Arrival: 07:15 AM Tomorrow
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-4">
          <div className="p-4 rounded-lg bg-muted/60 border border-border/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-foreground block">
                Scheduled Procedure: {patientCase?.procedureTitle ?? "Screening Colonoscopy"}
              </span>
              <p className="text-xs text-muted-foreground">
                Attending Proceduralist: {patientCase?.primarySurgeonName ?? "Dr. Arthur Vance, MD"}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
                <MapPin className="h-3.5 w-3.5" /> Metro GI Surgery Center • Suite 1 • 450 Health Parkway
              </p>
            </div>
            <div className="text-left md:text-right">
              <span className="text-[11px] text-muted-foreground block font-mono">
                {patientCase?.mrn ?? "MRN-83921"}
              </span>
              <Badge variant="secondary" className="text-[10px] mt-1">
                Sedation / IV MAC
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bowel Prep Timeline & Escort Verification */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bowel Prep Protocol */}
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="p-4 pb-3 border-b border-border/60">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Bowel Prep Timeline (Suprep Protocol)
            </CardTitle>
            <CardDescription className="text-xs">
              Adequate prep is essential for polyp detection
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-2.5 text-xs">
              <div className="flex items-start gap-2.5 p-2 rounded bg-muted/40">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold text-foreground block">Dose 1 (Completed 06:00 PM)</span>
                  <span className="text-muted-foreground">16 oz solution followed by 32 oz water</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2 rounded bg-accent/60 border border-foreground/10">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0 animate-pulse" />
                <div>
                  <span className="font-semibold text-foreground block">Dose 2 (Take at 03:00 AM)</span>
                  <span className="text-muted-foreground">Second 16 oz dose. Must finish 4 hours before arrival.</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2 rounded bg-destructive/10 text-destructive border border-destructive/20">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <span className="font-semibold block">Strict NPO (Fasting) Deadline</span>
                  <span>No water, gum, or liquids after 04:00 AM. Sedation safety requirement.</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Escort Driver Requirement */}
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="p-4 pb-3 border-b border-border/60">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Car className="h-4 w-4" />
              Mandatory Escort / Driver on File
            </CardTitle>
            <CardDescription className="text-xs">
              CMS regulations require an adult driver following sedation
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="p-3 rounded-lg border border-border/80 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Registered Escort:</span>
                <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/40">
                  Confirmed
                </Badge>
              </div>
              <p className="text-xs text-foreground font-medium">
                {user?.escortName ?? "Linda Miller (Spouse)"}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
                <Phone className="h-3 w-3" />
                {user?.escortPhone ?? "(555) 234-8901"}
              </p>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground">
              <p>• Your escort must remain on center premises during the procedure.</p>
              <p>• Rideshare (Uber/Lyft) without an accompanying adult is not permitted.</p>
            </div>

            <Button variant="outline" size="sm" className="w-full text-xs">
              Update Escort Contact Information
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
