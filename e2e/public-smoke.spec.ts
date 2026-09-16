import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()
  const serious = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? "")
  )
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
}

test.beforeEach(async ({ page, baseURL }) => {
  const allowedOrigin = new URL(baseURL!).origin
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === allowedOrigin || url.protocol === "data:") {
      await route.continue()
    } else {
      await route.abort("blockedbyclient")
    }
  })
})

for (const publicPage of [
  { path: "/auth", heading: "Welcome to Fleming" },
  { path: "/privacy", heading: "Privacy Policy" },
  { path: "/terms", heading: "Terms of Service" },
]) {
  test(`${publicPage.path} renders and passes accessibility smoke`, async ({ page }) => {
    await page.goto(publicPage.path)
    await expect(page.getByRole("heading", { name: publicPage.heading, level: 1 })).toBeVisible()
    await expectNoSeriousAccessibilityViolations(page)
  })
}

test("public prescription verification fails safely without credentials", async ({
  page,
  request,
}) => {
  const syntheticToken = "synthetic-invalid-token-no-phi"
  const response = await request.get(`/api/verify/rx/${syntheticToken}`, {
    headers: { "x-request-id": "playwright-request-0001" },
  })
  expect(response.status()).toBe(200)
  expect(response.headers()["x-request-id"]).toBe("playwright-request-0001")
  expect(await response.json()).toEqual({ valid: false, error: "Not found" })

  await page.goto(`/verify/rx/${syntheticToken}`)
  await expect(page.getByRole("heading", { name: "Not verified" })).toBeVisible()
  await expect(page.getByText(syntheticToken)).toHaveCount(0)
  await expect(
    page.getByText(/does not display patient details or medication information/i)
  ).toBeVisible()
  await expectNoSeriousAccessibilityViolations(page)
})
