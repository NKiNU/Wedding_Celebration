import { defineConfig, devices } from "@playwright/test";

const phones = {
  "iphone-safari": devices["iPhone 14"],
  "android-chrome": devices["Pixel 7"],
};

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:3000" },
  projects: [
    ...Object.entries(phones).map(([name, device]) => ({ name, use: device, testIgnore: /create\.spec/ })),
    // The create specs add posts, while join and wall count the seed: they run after those finish.
    ...Object.entries(phones).map(([name, device]) => ({
      name: `${name}-create`,
      use: device,
      testMatch: /create\.spec/,
      dependencies: Object.keys(phones),
    })),
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
