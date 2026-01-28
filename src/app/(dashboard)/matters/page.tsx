"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Search, Briefcase, Trash2, Pencil } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { getStatusColor } from "@/lib/utils"

interface Matter {
  id: string
  matterNumber: string
  name: string
  status: string
  billingType: string
  client: {
    firstName?: string
    lastName?: string
    companyName?: string
    type: string
  }
  practiceArea: { name: string; color: string }
  assignments: Array<{ user: { firstName: string; lastName: string } }>
  _count: { timeEntries: number; documents: number; deadlines: number }
}

interface PracticeArea {
  id: string
  name: string
  color: string
}

export default function MattersPage() {
  const router = useRouter()
  const [matters, setMatters] = useState<Matter[]>([])
  const [practiceAreas, setPracticeAreas] = useState<PracticeArea[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [practiceAreaFilter, setPracticeAreaFilter] = useState("all")
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await fetch(`/api/matters/${deleteId}`, { method: "DELETE" })
      setMatters(matters.filter(m => m.id !== deleteId))
    } catch (error) {
      console.error("Failed to delete matter:", error)
    } finally {
      setDeleteId(null)
    }
  }

  useEffect(() => {
    async function fetchData() {
      try {
        const status = statusFilter === "all" ? "" : statusFilter
        const practiceAreaId = practiceAreaFilter === "all" ? "" : practiceAreaFilter
        const [mattersRes, paRes] = await Promise.all([
          fetch(`/api/matters?search=${search}&status=${status}&practiceAreaId=${practiceAreaId}`),
          fetch("/api/practice-areas"),
        ])
        const [mattersData, paData] = await Promise.all([
          mattersRes.json(),
          paRes.json(),
        ])
        setMatters(mattersData)
        setPracticeAreas(paData)
      } catch (error) {
        console.error("Failed to fetch data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [search, statusFilter, practiceAreaFilter])

  const getClientName = (client?: Matter["client"]) => {
    if (!client) return "No Client"
    if (client.type === "BUSINESS" || client.type === "NONPROFIT") {
      return client.companyName || "Unnamed"
    }
    return `${client.firstName || ""} ${client.lastName || ""}`.trim() || "Unnamed"
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Matters</h1>
          <p className="text-muted-foreground">Manage your legal matters and cases</p>
        </div>
        <Link href="/matters/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Matter
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search matters..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="ON_HOLD">On Hold</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={practiceAreaFilter} onValueChange={setPracticeAreaFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Practice Areas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Practice Areas</SelectItem>
                {practiceAreas.map((pa) => (
                  <SelectItem key={pa.id} value={pa.id}>
                    {pa.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Matters Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="spinner" />
            </div>
          ) : matters.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Briefcase className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium">No matters found</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating your first matter
              </p>
              <Link href="/matters/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Matter
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matter</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Practice Area</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matters.map((matter) => (
                  <TableRow
                    key={matter.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => router.push(`/matters/${matter.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: matter.practiceArea.color + '20' }}>
                          <Briefcase className="h-5 w-5" style={{ color: matter.practiceArea.color }} />
                        </div>
                        <div>
                          <p className="font-medium">{matter.name}</p>
                          <p className="text-sm text-muted-foreground">{matter.matterNumber}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getClientName(matter.client)}</TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: matter.practiceArea.color }} className="text-white">
                        {matter.practiceArea.name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{matter.billingType.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex -space-x-2">
                        {matter.assignments.slice(0, 3).map((assignment, i) => (
                          <div
                            key={i}
                            className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-medium border-2 border-white"
                            title={`${assignment.user.firstName} ${assignment.user.lastName}`}
                          >
                            {assignment.user.firstName[0]}{assignment.user.lastName[0]}
                          </div>
                        ))}
                        {matter.assignments.length > 3 && (
                          <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium border-2 border-white">
                            +{matter.assignments.length - 3}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(matter.status)}>{matter.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/matters/${matter.id}/edit`)
                          }}
                        >
                          <Pencil className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteId(matter.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Matter?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the matter. You can restore it later from the archived matters list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
