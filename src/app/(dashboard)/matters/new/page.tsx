"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft } from "lucide-react"

interface Client {
  id: string
  clientNumber: string
  type: string
  firstName?: string
  lastName?: string
  companyName?: string
}

interface PracticeArea {
  id: string
  name: string
  color: string
}

export default function NewMatterPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedClientId = searchParams.get("clientId")

  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([])
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    clientId: preselectedClientId || "",
    practiceAreaId: "",
    billingType: "HOURLY",
    flatFee: "",
    contingencyPct: "",
    retainerAmount: "",
    budgetAmount: "",
    courtName: "",
    caseNumber: "",
    judgeName: "",
    jurisdiction: "",
    notes: "",
  })

  useEffect(() => {
    async function fetchData() {
      try {
        const [clientsRes, paRes] = await Promise.all([
          fetch("/api/clients"),
          fetch("/api/practice-areas"),
        ])
        const [clientsData, paData] = await Promise.all([
          clientsRes.json(),
          paRes.json(),
        ])
        setClients(clientsData.filter((c: Client) => c.type !== "ARCHIVED"))
        setPracticeAreas(paData)
      } catch (error) {
        console.error("Failed to fetch data:", error)
      }
    }

    fetchData()
  }, [])

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch("/api/matters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        const matter = await res.json()
        router.push(`/matters/${matter.id}`)
      }
    } catch (error) {
      console.error("Failed to create matter:", error)
    } finally {
      setLoading(false)
    }
  }

  const getClientName = (client: Client) => {
    if (client.type === "BUSINESS" || client.type === "NONPROFIT") {
      return `${client.companyName} (${client.clientNumber})`
    }
    return `${client.firstName} ${client.lastName} (${client.clientNumber})`
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center space-x-4">
        <Link href="/matters">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Matter</h1>
          <p className="text-muted-foreground">Create a new legal matter</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Basic Information */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientId">Client *</Label>
                  <Select
                    value={formData.clientId}
                    onValueChange={(value) => handleChange("clientId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {getClientName(client)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="practiceAreaId">Practice Area *</Label>
                  <Select
                    value={formData.practiceAreaId}
                    onValueChange={(value) => handleChange("practiceAreaId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select practice area" />
                    </SelectTrigger>
                    <SelectContent>
                      {practiceAreas.map((pa) => (
                        <SelectItem key={pa.id} value={pa.id}>
                          <div className="flex items-center">
                            <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: pa.color }} />
                            {pa.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Matter Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Smith Divorce, Jones v. ABC Corp"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the matter..."
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Billing */}
          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="billingType">Billing Type</Label>
                <Select
                  value={formData.billingType}
                  onValueChange={(value) => handleChange("billingType", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOURLY">Hourly</SelectItem>
                    <SelectItem value="FLAT_FEE">Flat Fee</SelectItem>
                    <SelectItem value="CONTINGENCY">Contingency</SelectItem>
                    <SelectItem value="HYBRID">Hybrid</SelectItem>
                    <SelectItem value="PRO_BONO">Pro Bono</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.billingType === "FLAT_FEE" && (
                <div className="space-y-2">
                  <Label htmlFor="flatFee">Flat Fee Amount</Label>
                  <Input
                    id="flatFee"
                    type="number"
                    placeholder="0.00"
                    value={formData.flatFee}
                    onChange={(e) => handleChange("flatFee", e.target.value)}
                  />
                </div>
              )}

              {formData.billingType === "CONTINGENCY" && (
                <div className="space-y-2">
                  <Label htmlFor="contingencyPct">Contingency Percentage</Label>
                  <Input
                    id="contingencyPct"
                    type="number"
                    placeholder="33.33"
                    value={formData.contingencyPct}
                    onChange={(e) => handleChange("contingencyPct", e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="retainerAmount">Retainer Amount</Label>
                <Input
                  id="retainerAmount"
                  type="number"
                  placeholder="0.00"
                  value={formData.retainerAmount}
                  onChange={(e) => handleChange("retainerAmount", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="budgetAmount">Budget Amount</Label>
                <Input
                  id="budgetAmount"
                  type="number"
                  placeholder="0.00"
                  value={formData.budgetAmount}
                  onChange={(e) => handleChange("budgetAmount", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Court Information */}
          <Card>
            <CardHeader>
              <CardTitle>Court Information (if applicable)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="courtName">Court Name</Label>
                <Input
                  id="courtName"
                  placeholder="e.g., NY Supreme Court"
                  value={formData.courtName}
                  onChange={(e) => handleChange("courtName", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="caseNumber">Case Number</Label>
                <Input
                  id="caseNumber"
                  placeholder="e.g., 2024-CV-12345"
                  value={formData.caseNumber}
                  onChange={(e) => handleChange("caseNumber", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="judgeName">Judge Name</Label>
                <Input
                  id="judgeName"
                  placeholder="e.g., Hon. John Smith"
                  value={formData.judgeName}
                  onChange={(e) => handleChange("judgeName", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="jurisdiction">Jurisdiction</Label>
                <Input
                  id="jurisdiction"
                  placeholder="e.g., New York County"
                  value={formData.jurisdiction}
                  onChange={(e) => handleChange("jurisdiction", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Additional notes about this matter..."
                value={formData.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                rows={4}
              />
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-4 mt-6">
          <Link href="/matters">
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" disabled={loading || !formData.clientId || !formData.practiceAreaId || !formData.name}>
            {loading ? "Creating..." : "Create Matter"}
          </Button>
        </div>
      </form>
    </div>
  )
}
