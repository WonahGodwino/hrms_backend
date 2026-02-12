// src/lib/db.ts - BACKWARD COMPATIBILITY LAYER
// This file ensures imports from @/lib/db also work

import { prisma } from './prisma'
export { prisma }
export default prisma