"use client"

import { createRefreshBus } from "./refresh-bus"

const bus = createRefreshBus()

export const onAppointmentsRefresh = bus.onRefresh
export const requestAppointmentsRefresh = bus.requestRefresh
