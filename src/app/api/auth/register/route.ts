import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Public registration is disabled. A firm administrator must provision accounts.' },
    { status: 403 },
  )
}
