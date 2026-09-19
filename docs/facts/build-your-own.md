---
id: build-your-own
status: current
decided: "d37556d"
appears:
  repo: ["README.md#splits-and-coverage", "README.md#known-gaps", "e2e/flows/07-choosing-a-split.md#building-your-own", "e2e/flows/07-choosing-a-split.md#expected-3", "e2e/flows/07-choosing-a-split.md#notes", "docs/training-model.md#historisation"]
  copy: ["split.buildOwn", "split.customH", "split.editTitle", "split.editIntro", "split.dayType", "split.slotName", "split.slotHolds", "split.addSlot", "split.addDay", "split.removeDay", "split.lastSlot", "split.moveUp", "split.moveDown", "split.editSlot", "split.removeSlot", "split.pinTitle", "split.pinNote", "split.reach", "split.drops", "split.save", "split.saveQ", "split.saveBody", "set.editSplit"]
  tests: ["e2e/tests/custom-split.spec.ts", "packages/domain/test/splits.test.ts"]
  confluence: ["934608916", "934608935", "934445138"]
---

Settings → Build your own starts from the current week: slots can be tied to movements or roles, moved with ↑/↓ (no drag-and-drop yet), added or removed, up to six days, with a preview of what counts as complete. A custom split keeps the goal of the split it grew from, minus any pattern no slot can hold.
