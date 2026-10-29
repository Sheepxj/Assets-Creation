import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearTestQueries } from "./query-clients";
afterEach(() => { cleanup(); clearTestQueries(); });
