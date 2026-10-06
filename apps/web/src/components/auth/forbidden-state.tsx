import { ErrorState } from "@asc/ui/components/clinical/error-state";

/** What a user sees at a screen their capabilities at this facility do not open (403). */
export function ForbiddenState() {
  return (
    <div data-testid="forbidden-state" data-status="403">
      <ErrorState
        title="You don't have access to this screen"
        message="Your role at this facility doesn't include it. Ask an administrator if you need access."
      />
    </div>
  );
}
