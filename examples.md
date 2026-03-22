# Yoox TODO App — Complete Trace Suite

## Conventions
- `todos`: full list in insertion order
- `visibleTodos`: filtered projection
- `filter ∈ {:all, :active, :completed}`
- `Todo(status, label)` where `status ∈ {:active, :completed}`
- `0_visibleTodo`: index into `visibleTodos`
- `editingTodo`: currently edited visible todo or nil
- `editDraft`: current edit string or nil

## Derived properties
- `remainingCount == count(todos where status == :active)`
- `completedCount == count(todos where status == :completed)`
- `canClearCompleted == completedCount > 0`
- `allCompleted == (todos != [] and remainingCount == 0)`
- `visibleTodos == filter(todos, filter)`

---

## 1. Empty app

```
!GET /
todos == [];
visibleTodos == [];
filter == :all;
remainingCount == 0;
completedCount == 0;
allCompleted == false;
canClearCompleted == false;
editingTodo == nil;
editDraft == nil;
```

---

## 2. Add one todo

```
!GET /
addTodo("Buy milk");
todos == [Todo(:active, "Buy milk")];
visibleTodos == [Todo(:active, "Buy milk")];
remainingCount == 1;
completedCount == 0;
allCompleted == false;
canClearCompleted == false;
```

---

## 3. Add multiple todos (preserve order, allow duplicates)

```
!GET /
addTodo("Buy milk");
addTodo("Walk dog");
addTodo("Buy milk");
todos == [
  Todo(:active, "Buy milk"),
  Todo(:active, "Walk dog"),
  Todo(:active, "Buy milk")
];
visibleTodos == [
  Todo(:active, "Buy milk"),
  Todo(:active, "Walk dog"),
  Todo(:active, "Buy milk")
];
remainingCount == 3;
completedCount == 0;
```

---

## 4. Trim input, ignore blank todos

```
!GET /
addTodo("  Buy milk  ");
todos == [Todo(:active, "Buy milk")];
addTodo("   ");
todos == [Todo(:active, "Buy milk")];
visibleTodos == [Todo(:active, "Buy milk")];
remainingCount == 1;
completedCount == 0;
```

---

## 5. Complete and reopen a todo

```
!GET /
addTodo("Buy milk");
markDone(0_visibleTodo);
todos == [Todo(:completed, "Buy milk")];
visibleTodos == [Todo(:completed, "Buy milk")];
remainingCount == 0;
completedCount == 1;
allCompleted == true;
canClearCompleted == true;

markUndone(0_visibleTodo);
todos == [Todo(:active, "Buy milk")];
visibleTodos == [Todo(:active, "Buy milk")];
remainingCount == 1;
completedCount == 0;
allCompleted == false;
canClearCompleted == false;
```

---

## 6. Mixed completion

```
!GET /
addTodo("A");
addTodo("B");
markDone(1_visibleTodo);
todos == [Todo(:active, "A"), Todo(:completed, "B")];
visibleTodos == [Todo(:active, "A"), Todo(:completed, "B")];
remainingCount == 1;
completedCount == 1;
allCompleted == false;
canClearCompleted == true;
```

---

## 7. Removing todos

```
!GET /
addTodo("A");
addTodo("B");
markDone(1_visibleTodo);

removeTodo(0_visibleTodo);
todos == [Todo(:completed, "B")];
visibleTodos == [Todo(:completed, "B")];
remainingCount == 0;
completedCount == 1;
allCompleted == true;

removeTodo(0_visibleTodo);
todos == [];
visibleTodos == [];
remainingCount == 0;
completedCount == 0;
allCompleted == false;
canClearCompleted == false;
```

---

## 8. Mark all / unmark all

```
!GET /
addTodo("A");
addTodo("B");

markAllDone();
todos == [Todo(:completed, "A"), Todo(:completed, "B")];
visibleTodos == [Todo(:completed, "A"), Todo(:completed, "B")];
remainingCount == 0;
completedCount == 2;
allCompleted == true;
canClearCompleted == true;

markAllUndone();
todos == [Todo(:active, "A"), Todo(:active, "B")];
visibleTodos == [Todo(:active, "A"), Todo(:active, "B")];
remainingCount == 2;
completedCount == 0;
allCompleted == false;
canClearCompleted == false;
```

---

## 9. Filtering

```
!GET /
addTodo("A");
addTodo("B");
markDone(1_visibleTodo);

setFilter(:active);
filter == :active;
visibleTodos == [Todo(:active, "A")];

setFilter(:completed);
filter == :completed;
visibleTodos == [Todo(:completed, "B")];

setFilter(:all);
filter == :all;
visibleTodos == [Todo(:active, "A"), Todo(:completed, "B")];

remainingCount == 1;
completedCount == 1;
```

---

## 10. Completing under active filter hides item

```
!GET /
addTodo("A");
addTodo("B");
markDone(1_visibleTodo);

setFilter(:active);
visibleTodos == [Todo(:active, "A")];

markDone(0_visibleTodo);
todos == [Todo(:completed, "A"), Todo(:completed, "B")];
visibleTodos == [];
remainingCount == 0;
completedCount == 2;
allCompleted == true;
```

---

## 11. Reopening under completed filter hides item

```
!GET /
addTodo("A");
addTodo("B");
markDone(0_visibleTodo);

setFilter(:completed);
visibleTodos == [Todo(:completed, "A")];

markUndone(0_visibleTodo);
todos == [Todo(:active, "A"), Todo(:active, "B")];
visibleTodos == [];
remainingCount == 2;
completedCount == 0;
allCompleted == false;
```

---

## 12. Add under completed filter

```
!GET /
addTodo("A");
markDone(0_visibleTodo);

setFilter(:completed);
visibleTodos == [Todo(:completed, "A")];

addTodo("B");
todos == [Todo(:completed, "A"), Todo(:active, "B")];
visibleTodos == [Todo(:completed, "A")];
filter == :completed;

remainingCount == 1;
completedCount == 1;
```

---

## 13. Add under active filter

```
!GET /
addTodo("A");
markDone(0_visibleTodo);

setFilter(:active);
visibleTodos == [];

addTodo("B");
todos == [Todo(:completed, "A"), Todo(:active, "B")];
visibleTodos == [Todo(:active, "B")];
filter == :active;

remainingCount == 1;
completedCount == 1;
```

---

## 14. Remove from filtered view

```
!GET /
addTodo("A");
addTodo("B");
markDone(1_visibleTodo);

setFilter(:completed);
visibleTodos == [Todo(:completed, "B")];

removeTodo(0_visibleTodo);
todos == [Todo(:active, "A")];
visibleTodos == [];
filter == :completed;

remainingCount == 1;
completedCount == 0;
canClearCompleted == false;
```

---

## 15. Clear completed (all view)

```
!GET /
addTodo("A");
addTodo("B");
addTodo("C");

markDone(0_visibleTodo);
markDone(2_visibleTodo);

clearCompleted();
todos == [Todo(:active, "B")];
visibleTodos == [Todo(:active, "B")];

remainingCount == 1;
completedCount == 0;
allCompleted == false;
canClearCompleted == false;
```

---

## 16. Clear completed (completed view)

```
!GET /
addTodo("A");
addTodo("B");
markDone(0_visibleTodo);

setFilter(:completed);
visibleTodos == [Todo(:completed, "A")];

clearCompleted();
todos == [Todo(:active, "B")];
visibleTodos == [];
filter == :completed;

remainingCount == 1;
completedCount == 0;
canClearCompleted == false;
```

---

## 17. Edit and save

```
!GET /
addTodo("Buy milk");

startEditing(0_visibleTodo);
editingTodo == 0_visibleTodo;
editDraft == "Buy milk";

setEditLabel("  Buy oat milk  ");
editDraft == "  Buy oat milk  ";

saveEdit();
editingTodo == nil;
editDraft == nil;

todos == [Todo(:active, "Buy oat milk")];
visibleTodos == [Todo(:active, "Buy oat milk")];
```

---

## 18. Cancel edit

```
!GET /
addTodo("Buy milk");

startEditing(0_visibleTodo);
setEditLabel("Buy oat milk");

cancelEdit();
editingTodo == nil;
editDraft == nil;

todos == [Todo(:active, "Buy milk")];
visibleTodos == [Todo(:active, "Buy milk")];
```

---

## 19. Empty edit deletes todo

```
!GET /
addTodo("A");
addTodo("B");

startEditing(0_visibleTodo);
setEditLabel("   ");

saveEdit();
todos == [Todo(:active, "B")];
visibleTodos == [Todo(:active, "B")];

remainingCount == 1;
completedCount == 0;
```

---

## 20. Editing preserves completion state

```
!GET /
addTodo("A");
markDone(0_visibleTodo);

startEditing(0_visibleTodo);
setEditLabel("A!");
saveEdit();

todos == [Todo(:completed, "A!")];
visibleTodos == [Todo(:completed, "A!")];

remainingCount == 0;
completedCount == 1;
allCompleted == true;
```

---

## 21. Editing from filtered view

```
!GET /
addTodo("A");
addTodo("B");
markDone(1_visibleTodo);

setFilter(:completed);
visibleTodos == [Todo(:completed, "B")];

startEditing(0_visibleTodo);
setEditLabel("B!");
saveEdit();

todos == [Todo(:active, "A"), Todo(:completed, "B!")];
visibleTodos == [Todo(:completed, "B!")];
filter == :completed;

remainingCount == 1;
completedCount == 1;
```
