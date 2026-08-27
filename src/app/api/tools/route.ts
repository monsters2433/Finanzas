import { body, fail, handleError, ok, str } from "@/lib/http";
import { detectPayrolls } from "@/lib/payroll";
import { recategorizeAll } from "@/lib/sync";
import { seedDemoData } from "@/lib/demo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { action } = await body<{ action?: string }>(request);
  try {
    switch (str(action)) {
      case "recategorize":
        return ok({ changed: recategorizeAll(false) });
      case "recategorize-missing":
        return ok({ changed: recategorizeAll(true) });
      case "detect-payrolls":
        return ok({ found: detectPayrolls() });
      case "seed-demo":
        return ok(seedDemoData());
      default:
        return fail("Acción desconocida.");
    }
  } catch (err) {
    return handleError(err);
  }
}
