"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCategories, useGroups } from "@/components/dashboard/use-dashboard-data"
import type { Category, Group } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FolderOpen, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { mutate } from "swr"

type CategoryFormState = {
  name: string
  type: "expense" | "income"
  color: string
  icon: string
  group_id: string
  parent_id: string
}

type GroupFormState = {
  name: string
  description: string
  color: string
}

const emptyCategoryForm: CategoryFormState = {
  name: "",
  type: "expense",
  color: "#2563eb",
  icon: "",
  group_id: "__none",
  parent_id: "__none",
}

const emptyGroupForm: GroupFormState = {
  name: "",
  description: "",
  color: "#2563eb",
}

function categoryToForm(category: Category): CategoryFormState {
  return {
    name: category.name,
    type: category.type,
    color: category.color || "#2563eb",
    icon: category.icon || "",
    group_id: category.group_id || "__none",
    parent_id: category.parent_id || "__none",
  }
}

function groupToForm(group: Group): GroupFormState {
  return {
    name: group.name,
    description: group.description || "",
    color: group.color || "#2563eb",
  }
}

export function CategoriesGroupsManagement() {
  const { data: categories, isLoading: categoriesLoading } = useCategories()
  const { data: groups, isLoading: groupsLoading } = useGroups()
  const [search, setSearch] = useState("")
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm)
  const [groupForm, setGroupForm] = useState<GroupFormState>(emptyGroupForm)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visibleCategories = useMemo(() => {
    const query = search.toLowerCase()
    return (categories || []).filter((category) =>
      `${category.name} ${category.type} ${category.group?.name || ""}`.toLowerCase().includes(query)
    )
  }, [categories, search])

  const visibleGroups = useMemo(() => {
    const query = search.toLowerCase()
    return (groups || []).filter((group) =>
      `${group.name} ${group.description || ""}`.toLowerCase().includes(query)
    )
  }, [groups, search])

  const openNewCategory = () => {
    setEditingCategory(null)
    setCategoryForm(emptyCategoryForm)
    setError(null)
    setCategoryDialogOpen(true)
  }

  const openEditCategory = (category: Category) => {
    setEditingCategory(category)
    setCategoryForm(categoryToForm(category))
    setError(null)
    setCategoryDialogOpen(true)
  }

  const openNewGroup = () => {
    setEditingGroup(null)
    setGroupForm(emptyGroupForm)
    setError(null)
    setGroupDialogOpen(true)
  }

  const openEditGroup = (group: Group) => {
    setEditingGroup(group)
    setGroupForm(groupToForm(group))
    setError(null)
    setGroupDialogOpen(true)
  }

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) {
      setError("El nombre es requerido")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No estas autenticado")

      const payload = {
        user_id: user.id,
        name: categoryForm.name.trim(),
        type: categoryForm.type,
        color: categoryForm.color,
        icon: categoryForm.icon.trim() || null,
        group_id: categoryForm.group_id === "__none" ? null : categoryForm.group_id,
        parent_id: categoryForm.parent_id === "__none" ? null : categoryForm.parent_id,
      }

      const result = editingCategory
        ? await supabase.from("categories").update(payload).eq("id", editingCategory.id)
        : await supabase.from("categories").insert(payload)

      if (result.error) throw result.error

      mutate("categories")
      mutate((key) => typeof key === "string" && key.startsWith("transactions"))
      setCategoryDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la categoria")
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveGroup = async () => {
    if (!groupForm.name.trim()) {
      setError("El nombre es requerido")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No estas autenticado")

      const payload = {
        user_id: user.id,
        name: groupForm.name.trim(),
        description: groupForm.description.trim() || null,
        color: groupForm.color,
      }

      const result = editingGroup
        ? await supabase.from("groups").update(payload).eq("id", editingGroup.id)
        : await supabase.from("groups").insert(payload)

      if (result.error) throw result.error

      mutate("groups")
      mutate("categories")
      mutate((key) => typeof key === "string" && key.startsWith("transactions"))
      setGroupDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar el grupo")
    } finally {
      setIsSubmitting(false)
    }
  }

  const deleteCategory = async (category: Category) => {
    if (!window.confirm(`Eliminar la categoria "${category.name}"?`)) return
    const supabase = createClient()
    const { error: deleteError } = await supabase.from("categories").delete().eq("id", category.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    mutate("categories")
    mutate((key) => typeof key === "string" && key.startsWith("transactions"))
  }

  const deleteGroup = async (group: Group) => {
    if (!window.confirm(`Eliminar el grupo "${group.name}"?`)) return
    const supabase = createClient()
    const { error: deleteError } = await supabase.from("groups").delete().eq("id", group.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    mutate("groups")
    mutate("categories")
    mutate((key) => typeof key === "string" && key.startsWith("transactions"))
  }

  const parentCandidates = (categories || []).filter(
    (category) => category.type === categoryForm.type && category.id !== editingCategory?.id
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Categorias y grupos</h2>
          <p className="text-sm text-muted-foreground">Organizacion para gastos, ingresos y presupuestos.</p>
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <Tabs defaultValue="categories" className="space-y-4">
        {error && !categoryDialogOpen && !groupDialogOpen && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        <TabsList>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="groups">Grupos</TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle>Categorias</CardTitle>
                <Button onClick={openNewCategory}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {categoriesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : visibleCategories.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">No hay categorias registradas</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Grupo</TableHead>
                        <TableHead>Padre</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleCategories.map((category) => (
                        <TableRow key={category.id}>
                          <TableCell>
                            <div className="flex items-center gap-2 font-medium">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                              {category.icon && <span className="text-muted-foreground">{category.icon}</span>}
                              {category.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={category.type === "expense" ? "destructive" : "secondary"}>
                              {category.type === "expense" ? "Gasto" : "Ingreso"}
                            </Badge>
                          </TableCell>
                          <TableCell>{category.group?.name || "-"}</TableCell>
                          <TableCell>{categories?.find((item) => item.id === category.parent_id)?.name || "-"}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditCategory(category)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => deleteCategory(category)}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <CardTitle>Grupos</CardTitle>
                <Button onClick={openNewGroup}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Nuevo
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {groupsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : visibleGroups.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">No hay grupos registrados</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right">Categorias</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleGroups.map((group) => (
                        <TableRow key={group.id}>
                          <TableCell>
                            <div className="flex items-center gap-2 font-medium">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: group.color }} />
                              {group.name}
                            </div>
                          </TableCell>
                          <TableCell>{group.description || "-"}</TableCell>
                          <TableCell className="text-right">
                            {(categories || []).filter((category) => category.group_id === group.id).length}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEditGroup(group)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive" onClick={() => deleteGroup(group)}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Editar categoria" : "Nueva categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category-name">Nombre</Label>
                <Input id="category-name" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={categoryForm.type} onValueChange={(value) => setCategoryForm({ ...categoryForm, type: value as "expense" | "income", parent_id: "__none" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Gasto</SelectItem>
                    <SelectItem value="income">Ingreso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Grupo</Label>
                <Select value={categoryForm.group_id} onValueChange={(value) => setCategoryForm({ ...categoryForm, group_id: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin grupo</SelectItem>
                    {groups?.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoria padre</Label>
                <Select value={categoryForm.parent_id} onValueChange={(value) => setCategoryForm({ ...categoryForm, parent_id: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin padre</SelectItem>
                    {parentCandidates.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category-color">Color</Label>
                <Input id="category-color" type="color" value={categoryForm.color} onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category-icon">Icono</Label>
                <Input id="category-icon" placeholder="Ej: casa, food, $" value={categoryForm.icon} onChange={(event) => setCategoryForm({ ...categoryForm, icon: event.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveCategory} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Editar grupo" : "Nuevo grupo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <Label htmlFor="group-name">Nombre</Label>
              <Input id="group-name" value={groupForm.name} onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-description">Descripción</Label>
              <Textarea id="group-description" value={groupForm.description} onChange={(event) => setGroupForm({ ...groupForm, description: event.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-color">Color</Label>
              <Input id="group-color" type="color" value={groupForm.color} onChange={(event) => setGroupForm({ ...groupForm, color: event.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveGroup} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
