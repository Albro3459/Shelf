/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as books from "../books.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as listModel from "../listModel.js";
import type * as lists from "../lists.js";
import type * as monitoring from "../monitoring.js";
import type * as notificationModel from "../notificationModel.js";
import type * as notificationState from "../notificationState.js";
import type * as notifications from "../notifications.js";
import type * as polling from "../polling.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  alerts: typeof alerts;
  auth: typeof auth;
  books: typeof books;
  catalog: typeof catalog;
  crons: typeof crons;
  email: typeof email;
  http: typeof http;
  listModel: typeof listModel;
  lists: typeof lists;
  monitoring: typeof monitoring;
  notificationModel: typeof notificationModel;
  notificationState: typeof notificationState;
  notifications: typeof notifications;
  polling: typeof polling;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
