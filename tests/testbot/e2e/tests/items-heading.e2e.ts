// Items page of e2e-pr-app: its main heading reads "All items".
import type { Locator, Page } from "@playwright/test";
import { test, checkRequestPayload, expect, newSkyrampPlaywrightPage } from "@skyramp/skyramp";

const baseUrl = process.env.SKYRAMP_TEST_SERVICE_URL_UI || "http://localhost:3000";
const email = process.env.SKYRAMP_UI_USERNAME || "test@example.com";

class LoginPage {
  readonly email: Locator;
  readonly password: Locator;
  readonly signIn: Locator;
  constructor(readonly page: Page) {
    this.email = page.getByLabel("Email");
    this.password = page.getByLabel("Password");
    this.signIn = page.getByRole("button", { name: "Sign in" });
  }
  async signInAs(user: string, password: string) {
    await this.page.goto(`${baseUrl}/login`);
    await this.email.fill(user);
    await this.password.fill(password);
    await this.signIn.click();
  }
}

class ItemsPage {
  readonly mainHeading: Locator;
  readonly userStatus: Locator;
  readonly newItem: Locator;
  readonly addItem: Locator;
  readonly itemError: Locator;
  readonly items: Locator;
  constructor(readonly page: Page) {
    this.mainHeading = page.getByRole("heading", { level: 1 });
    this.userStatus = page.getByTestId("user-status");
    this.newItem = page.getByLabel("New item");
    this.addItem = page.getByRole("button", { name: "Add item" });
    this.itemError = page.getByTestId("item-error");
    this.items = page.getByTestId("items-list").getByTestId("item");
  }
  headingNamed(name: string) {
    return this.page.getByRole("heading", { name, exact: true });
  }
}

function password(): string {
  const value = process.env.SKYRAMP_UI_PASSWORD;
  if (value === undefined) throw new Error("SKYRAMP_UI_PASSWORD is not set");
  return value;
}

async function itemNamesFromApi(page: Page): Promise<string[]> {
  const res = await page.request.get(`${baseUrl}/api/items`);
  expect(res.status()).toBe(200);
  const items: { id: number; name: string }[] = await res.json();
  return [...items].sort((a, b) => a.id - b.id).map((i) => i.name);
}

test.describe("items page heading", () => {
  test.setTimeout(60000);

  test("the items page main heading reads All items", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const login = new LoginPage(page);
    const items = new ItemsPage(page);

    await login.signInAs(email, password());
    await expect(page).toHaveURL(`${baseUrl}/items`);
    await expect(items.mainHeading).toHaveCount(1);
    await expect(items.mainHeading).toHaveText("All items", { useInnerText: true });
    await expect(items.headingNamed("Items")).toHaveCount(0);
  });

  test("sign in, see the items under All items, add an item and see it after a reload", async ({ page }) => {
    page = newSkyrampPlaywrightPage(page);
    const login = new LoginPage(page);
    const items = new ItemsPage(page);
    const newName = `Journey item ${Date.now()}`;
    let before: string[] = [];

    await test.step("1. sign in at /login", async () => {
      await login.signInAs(email, password());
      await expect.soft(page).toHaveURL(`${baseUrl}/items`);
    });

    await test.step("2. look at the items page", async () => {
      await expect.soft(items.mainHeading).toHaveText("All items");
      await expect.soft(items.headingNamed("Items")).toHaveCount(0);
      await expect.soft(items.userStatus).toHaveText(`Signed in as ${email}`);
      before = await itemNamesFromApi(page);
      await expect.soft(items.items).toHaveText(before);
    });

    await test.step("3. add an item", async () => {
      await items.newItem.fill(newName);
      const responsePromise = page.waitForResponse(
        (r) => r.url().endsWith("/api/items") && r.request().method() === "POST",
      );
      await items.addItem.click();
      const response = await responsePromise;
      checkRequestPayload(response.request().postDataJSON(), { name: newName });
      expect.soft(response.status()).toBe(201);
      await expect.soft(items.items).toHaveText([...before, newName]);
      await expect.soft(items.newItem).toHaveValue("");
      await expect.soft(items.itemError).toBeHidden();
    });

    await test.step("4. reload the items page", async () => {
      await page.reload();
      await expect(items.mainHeading).toHaveText("All items");
      await expect(items.headingNamed("Items")).toHaveCount(0);
      await expect(items.userStatus).toHaveText(`Signed in as ${email}`);
      await expect(items.itemError).toBeHidden();
      await expect(items.newItem).toHaveValue("");
      await expect(items.items).toHaveText([...before, newName]);
    });
  });
});
