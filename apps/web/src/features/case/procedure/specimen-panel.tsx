"use client";

import { useState } from "react";
import type { CaseDetail } from "@asc/types";
import { Button, EmptyState, SectionCard } from "@asc/ui";
import { FlaskConical, Plus } from "@asc/ui/icons";
import { AddSpecimenForm } from "./add-specimen-form";
import { SpecimenLabel } from "./specimen-label";

interface SpecimenPanelProps {
  readonly detail: CaseDetail;
  readonly editable: boolean;
}

/** Specimen jars with printed-label preview; each jar shows its linked polyp images. */
export function SpecimenPanel({ detail, editable }: SpecimenPanelProps) {
  const [adding, setAdding] = useState(false);
  const { specimens, images } = detail;

  return (
    <SectionCard
      title="Specimens"
      description={`${specimens.length} jar${specimens.length === 1 ? "" : "s"} · labels print with two identifiers`}
      actions={
        editable && !adding ? (
          <Button size="lg" className="h-12 px-4 text-base" onClick={() => setAdding(true)} data-testid="procedure-specimen-add">
            <Plus />
            Add jar
          </Button>
        ) : undefined
      }
      data-testid="procedure-specimens"
    >
      <div className="space-y-3">
        {adding && <AddSpecimenForm detail={detail} onDone={() => setAdding(false)} />}
        {specimens.length === 0 && !adding ? (
          <EmptyState
            icon={FlaskConical}
            title="No specimens"
            description={editable ? "Add a jar when a polyp or biopsy is retrieved." : "No specimens were collected."}
          />
        ) : (
          <ul className="space-y-2">
            {specimens.map((specimen) => (
              <li key={specimen.id}>
                <SpecimenLabel
                  jar={specimen.jar}
                  patient={detail.case.patient}
                  caseNumber={detail.case.caseNumber}
                  site={specimen.site}
                  sizeMm={specimen.sizeMm}
                  removalMethod={specimen.removalMethod}
                  description={specimen.description}
                  collectedAt={specimen.collectedAt}
                  status={specimen.pathologyStatus}
                  imageCount={images.filter((image) => image.specimenId === specimen.id).length}
                  data-testid={`procedure-specimen-${specimen.jar.toLowerCase()}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
