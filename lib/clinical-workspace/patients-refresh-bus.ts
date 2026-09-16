"use client"

import { createRefreshBus } from "./refresh-bus"

const bus = createRefreshBus()

export const onPatientsRefresh = bus.onRefresh
export const requestPatientsRefresh = bus.requestRefresh
