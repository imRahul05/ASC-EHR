"use client";

import { useState } from "react";
import { useAddImage } from "@asc/api-client/react";
import { ANATOMIC_SITE_LABEL, formatTime24 } from "@asc/clinical-rules";
import type { AnatomicSite, CaseDetail } from "@asc/types";
import { Badge, EmptyState, OptionSelect, SectionCard, TapTile, toast } from "@asc/ui";
import { Camera, Images } from "@asc/ui/icons";
import { notifyError } from "../notify-error";
import { ScopeThumbnail } from "./scope-thumbnail";

interface ImageCaptureGridProps {
  readonly detail: CaseDetail;
  readonly editable: boolean;
}

interface Landmark {
  readonly id: string;
  readonly site: AnatomicSite;
  readonly caption: string;
}

/** Photo-documentation landmarks (quality: cecal intubation proof, retroflexion). */
const COLON_LANDMARKS: readonly Landmark[] = [
  { id: "appendiceal", site: "cecum", caption: "Appendiceal orifice" },
  { id: "icv", site: "cecum", caption: "Ileocecal valve" },
  { id: "ti", site: "terminal_ileum", caption: "Terminal ileum" },
  { id: "retroflexion", site: "rectum", caption: "Retroflexion in rectum" },
];

const UPPER_LANDMARKS: readonly Landmark[] = [
  { id: "gej", site: "esophagus", caption: "Gastroesophageal junction" },
  { id: "retro-stomach", site: "stomach", caption: "Retroflexion in stomach" },
  { id: "d2", site: "duodenum", caption: "Second portion of duodenum" },
];

const NO_JAR = "none";

/** Image capture grid: tap a landmark to capture (mock frame), optionally link to a specimen jar. */
export function ImageCaptureGrid({ detail, editable }: ImageCaptureGridProps) {
  const [linkJar, setLinkJar] = useState<string>(NO_JAR);
  const addImage = useAddImage(detail.case.id);
  const landmarks = detail.case.procedure === "EGD" ? UPPER_LANDMARKS : COLON_LANDMARKS;
  const jarOptions = [
    { value: NO_JAR, label: "No jar" },
    ...detail.specimens.map((specimen) => ({ value: specimen.id, label: `Jar ${specimen.jar} · ${ANATOMIC_SITE_LABEL[specimen.site]}` })),
  ];
  const pendingCaption = addImage.isPending ? addImage.variables.caption : null;

  const capture = (landmark: Landmark) => {
    const specimen = detail.specimens.find((item) => item.id === linkJar);
    addImage.mutate(
      specimen
        ? { site: specimen.site, caption: `${landmark.caption} · polyp jar ${specimen.jar}`, specimenId: specimen.id }
        : { site: landmark.site, caption: landmark.caption },
      { onSuccess: () => toast.success(`Captured: ${landmark.caption}`), onError: notifyError("Could not capture the image") },
    );
  };

  return (
    <SectionCard title="Images" description="Tap a landmark to capture and annotate the frame." data-testid="procedure-images">
      <div className="space-y-4">
        {editable && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 @3xl:grid-cols-4">
              {landmarks.map((landmark) => (
                <TapTile
                  key={landmark.id}
                  label={landmark.caption}
                  detail={pendingCaption?.startsWith(landmark.caption) ? "Capturing…" : ANATOMIC_SITE_LABEL[landmark.site]}
                  icon={Camera}
                  disabled={addImage.isPending}
                  onClick={() => capture(landmark)}
                  data-testid={`procedure-capture-${landmark.id}`}
                />
              ))}
            </div>
            {detail.specimens.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="capture-link-jar" className="text-sm text-muted-foreground">
                  Link next capture to
                </label>
                <OptionSelect id="capture-link-jar" options={jarOptions} value={linkJar} onValueChange={setLinkJar} className="w-60 data-[size=default]:h-12" />
              </div>
            )}
          </div>
        )}

        {detail.images.length === 0 ? (
          <EmptyState icon={Images} title="No images yet" description={editable ? "Capture landmarks as you reach them." : "No images were captured."} />
        ) : (
          <ul className="grid grid-cols-2 gap-3 @md:grid-cols-3 @5xl:grid-cols-4" data-testid="procedure-image-grid">
            {detail.images.map((image) => {
              const jar = detail.specimens.find((specimen) => specimen.id === image.specimenId)?.jar;
              return (
                <li key={image.id} className="space-y-1.5">
                  <div className="relative">
                    <ScopeThumbnail seed={image.id} lesion={jar !== undefined} />
                    <span className="absolute top-1.5 left-1.5 rounded bg-background/85 px-1.5 font-mono text-xs tabular-nums">{formatTime24(image.at)}</span>
                    {jar && <Badge className="absolute top-1.5 right-1.5">Jar {jar}</Badge>}
                  </div>
                  <p className="text-sm leading-tight font-medium">{image.caption}</p>
                  <p className="text-xs text-muted-foreground">{ANATOMIC_SITE_LABEL[image.site]}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
