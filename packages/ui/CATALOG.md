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

## Tokens (Tailwind classes)

`bg-background` `bg-card` `bg-muted` `text-muted-foreground` `border-border` · accent `bg-primary` `text-primary`
`bg-accent` `text-accent-foreground` · AI `bg-ai` `text-ai-foreground` `border-ai-border` · status `text-success`
`bg-success/10` `text-warning` `bg-warning/10` `text-info` `text-destructive` (+ `-foreground` for solid fills) ·
phases `bg-phase-{scheduling|dayof|procedure|recovery|post|stopped}` + `text-phase-…-foreground` ·
charts `chart-1…5`. Radius `rounded-lg` = `--radius` (0.75rem). Shadows `shadow-xs` / `shadow-sm` only.
Use `tabular-nums` for clinical values.
