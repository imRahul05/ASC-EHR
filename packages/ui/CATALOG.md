# @asc/ui catalog

Search here before creating a component. Everything is exported from `@asc/ui` (icons from `@asc/ui/icons`).
Kit components are presentational: props in, callbacks out — no fetching, no routing, no Medplum.
Colours come from tokens only (see "Tokens" below); never hex in components.

## Primitives (shadcn on Base UI)

| Component | Usage |
|---|---|
| `Avatar`, `AvatarFallback` | `<Avatar><AvatarFallback>AV</AvatarFallback></Avatar>` |
| `Badge` | `<Badge variant="outline">Label</Badge>` (default · secondary · destructive · outline · ghost · link) |
| `Button` | `<Button variant="outline" size="sm">` — as a link: `render={<Link href="/x" />} nativeButton={false}` |
| `Card` (+ `CardHeader/Title/Description/Content/Footer`) | generic card; prefer `SectionCard` for screen blocks |
| `Checkbox` | `<Checkbox checked={v} onCheckedChange={setV} />` (Base UI) |
| `Dialog` (+ `DialogContent/Header/Title/Description/Footer/Close/Trigger`) | confirms and forms; irreversible actions must name patient + action |
| `DropdownMenu` (+ `Trigger/Content/Item/Label/Separator/Group`) | `<DropdownMenuItem variant="destructive">` |
| `Input`, `Textarea`, `Label` | form controls (`Textarea` auto-grows via `field-sizing`) |
| `Kbd` | `<Kbd>⌘K</Kbd>` |
| `Progress` | `<Progress value={60} tone="success" />` (tone: default · success · warning · destructive · ai) |
| `Select` (+ `SelectTrigger/Value/Content/Item`) | Base UI select; pass `items` for labels |
| `Separator` | `<Separator orientation="vertical" />` |
| `Sheet` | side panel (e.g. book-case sheet) |
| `Sidebar*` | app shell only |
| `Skeleton` | low-level shimmer; prefer `LoadingSkeleton` |
| `Switch` | `<Switch checked={v} onCheckedChange={setV} />` |
| `Table` (+ `TableHeader/Body/Row/Head/Cell`) | low-level; prefer `DataTable` |
| `Tabs`, `TabsList` (`variant="line"`), `TabsTrigger`, `TabsContent` | `<Tabs value onValueChange>` |
| `Tooltip`, `TooltipTrigger`, `TooltipContent` | `TooltipProvider` is mounted in app providers |
| `Toaster`, `toast` | `toast.success("Saved")`, `toast.error(apiError.message)` — `Toaster` is mounted once in providers |

## Forms, theme, navigation

| Component | Usage |
|---|---|
| `FormField` + `FieldConfig` | config-driven fields: `FIELDS.map(f => <FormField id label error>…</FormField>)` |
| `ThemeProvider`, `ThemeToggle` | theme (never import next-themes in an app) |
| `CommandPalette` | `<CommandPalette open onOpenChange query onQueryChange groups={[{ id, label, items: [{ id, label, hint, icon, onSelect }] }]} isLoading />` — Base UI Dialog, arrow keys + Enter |
| `OptionSelect<T>` + `SelectOption` | `<OptionSelect id options={[{ value, label, hint? }]} value onValueChange invalid? />` — config-driven Base UI select; wire to RHF with `Controller` |

## Clinical kit

| Component | Props (all readonly) | Usage |
|---|---|---|
| `PageHeader` | `title, description?, eyebrow?, actions?` | top of every screen |
| `SectionCard` | `title?, description?, actions?, footer?, children, contentClassName?, data-testid?` | hairline surface for a block |
| `StatCard` | `label, value, hint?, icon?, tone?, trend?: { direction, label, positive? }, isLoading?` | KPI tile (replaces the old `KpiCard`) |
| `EmptyState` | `title, description?, icon?, action?` | empty lists — always say the next action |
| `ErrorState` | `title?, message?, onRetry?` | message from `ApiError`, never raw server text |
| `LoadingSkeleton` | `variant?: "page" \| "table" \| "cards" \| "detail", rows?` | skeleton of the final layout |
| `DataTable<TRow>` | `columns: { id, header, cell(row), align?, className? }[], rows, getRowId, onRowClick?, isLoading?, empty?` | config-driven table |
| `Timeline` | `items: { id, at (ISO), title, description?, icon?, tone? }[]` | events, audit trail, phase history (24 h times) |
| `PhaseChip` | `phase: CasePhase, size?: "sm" \| "md"` | phase = tint + icon + label |
| `PhaseStepper` | `phase, phases?` | compact 13-step horizontal progress |
| `PHASE_GROUP_CLASS` / `PHASE_GROUP_DOT` / `PHASE_GROUP_ICON` | `Record<PhaseGroup, …>` | whiteboard columns, custom chips |
| `PatientBanner` | `patient: PatientRef, allergies, phase?, escort?, meta?: ReactNode[], actions?` | every patient/case screen |
| `GateChecklist` | `result: RuleResult, title?, okLabel?` | shows `checks` ✓/✗ with failing reasons |
| `DraftBanner` | `state: "streaming" \| "draft" \| "signed", message?, meta?, actions?` | AI document state (cancel/retry in `actions`) |
| `AiBadge` | `label?` (default "AI draft") | per-field AI marker |
| `ProvenanceChip` | `provenance: AiProvenance, editedBy?` | agent / prompt version / time tooltip |
| `GapChip` | `chip: GapChip (from @asc/types), onResolve?(chip)` | blocking chips disable signing |
| `SignaturePad` | `label, onChange(dataUrl \| null), disabled?, height?` | canvas signature (mouse/pen/touch), ink = `currentColor`; pair with a typed signer name |
| `Sparkline` | `values: number[], label, min?, max?, className?` (colour via `text-*` token) | vitals mini trend, KPI tiles |
| `useNow()` | hook → `number` (ms), shared 15 s tick via `useSyncExternalStore` | live elapsed timers (whiteboard, room) |
| `SegmentedControl<T>` | `options: { value, label, hint? }[], value \| null, onValueChange, aria-label, size?` | radio-group row (scores 0–2, small filters); arrow keys |
| `TrendChart` | `points: { key, label, value }[], title, formatValue, target?: { value, label }, domain?, height?` | single-series 30-day trend, crosshair tooltip, dashed target line (`chart-1`) |
| `TargetBarList` | `rows: { id, label, value, hint? }[], max, formatValue, targets?: { value, label }[]` | horizontal bars vs benchmark lines (ADR by surgeon) |
| `SourceDocument` | `text (pages split by \f), highlight?: { start, end }, header?` | fax / scanned doc rendered as paper; highlight = AI source span |
| `ConfidenceBadge` (+ `confidenceTone`) | `value: 0–1` | AI confidence % + word (high ≥ 0.9 · check ≥ 0.85 · low) |
| `RoomTimeGrid` | `rooms: { id, name, status? }[], items: { id, roomId, start, durationMin, phase, title, subtitle?, meta?, label }[], date, startHour?, endHour?, slotMinutes?, now?, onItemClick?, onSlotClick?` | schedule day board by room; blocks tinted by phase group; empty-slot click to book |
| `StaleBadge` | `refreshing?, stale?` | async "stale" state: background refetch / out-of-date marker (renders nothing when fresh) |
| `OfflineBanner` + `useOnlineStatus()` | `queuedCount?` | async "offline" state; renders only while the browser is offline |
| `EligibilityChip` | `status: EligibilityStatus \| null \| undefined` | 270/271 result chip (Eligible · Inactive · Pending · Check failed · Not verified) |
| `ElapsedTime` (+ `formatClock`) | `since (ms \| ISO), until?, label?` — own 1 s clock, `m:ss` | procedure timer, AI generation elapsed (use `useNow` for minute-level) |
| `PipelineSteps` | `steps: { id, label, status: pending\|active\|done\|failed\|skipped, hint?, group? }[]` | job progress; same `group` = parallel branches in one row (draft-first note pipeline) |
| `TapTile` | `label, detail?, icon?, done?, disabled?, onClick` | room-mode tap target (≥ 64 px, `aria-pressed`) for event taps / time-out items |
| `OfflineQueueBadge` | `online, queued` | always-visible connection + queue pill (pair with `useOnlineStatus`) |

## Onboarding & help

| Component | Props (all readonly) | Usage |
|---|---|---|
| `WelcomeDialog` | `open, onOpenChange, title, intro, highlights: { id, title, description, icon? }[], note?, primaryLabel, onPrimary, secondaryLabel, onSecondary` | first-run intro with two ways in (focus trap, Esc closes) |
| `TourChecklist` | `steps: { id, title, description, badge, done, autoHint? }[], collapsed, onCollapsedChange, onGo(id), onToggleDone(id, done), onDismiss, pendingStepId?, title?, completeMessage?` | floating bottom-right guided-demo checklist; collapses to a pill, Esc minimises |
| `HelpSheet` | `open, onOpenChange, title, eyebrow?, purpose, steps: string[], records?: { id, label, hint?, onSelect }[], roles: string[], mocked, production, footer?` | right-side contextual help for the current screen |
| `HintStrip` | `title, children, onDismiss, actionLabel?, onAction?, data-testid?` | quiet dismissable one-line hint at the top of a section |

## Tokens (Tailwind classes)

`bg-background` `bg-card` `bg-muted` `text-muted-foreground` `border-border` · accent `bg-primary` `text-primary`
`bg-accent` `text-accent-foreground` · AI `bg-ai` `text-ai-foreground` `border-ai-border` · status `text-success`
`bg-success/10` `text-warning` `bg-warning/10` `text-info` `text-destructive` (+ `-foreground` for solid fills) ·
phases `bg-phase-{scheduling|dayof|procedure|recovery|post|stopped}` + `text-phase-…-foreground` ·
charts `chart-1…5`. Radius `rounded-lg` = `--radius` (0.75rem). Shadows `shadow-xs` / `shadow-sm` only.
Use `tabular-nums` for clinical values.
