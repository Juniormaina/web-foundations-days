let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

function searchNotes(word) {
  const searchWord = word.toLowerCase();

  return notes.filter((note) =>
    note.text.toLowerCase().includes(searchWord)
  );
}

function longestNote() {
  if (notes.length === 0) {
    return null;
  }

  let longest = notes[0];

  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }

  return longest;
}

function countByCategory() {
  const counts = {};

  for (const note of notes) {
    if (!counts[note.category]) {
      counts[note.category] = 0;
    }

    counts[note.category]++;
  }

  return counts;
}

function getSummary() {
  const counts = countByCategory();
  const noteWord = notes.length === 1 ? "note" : "notes";

  return `${notes.length} ${noteWord}: ${counts.personal || 0} personal, ${counts.work || 0} work, ${counts.study || 0} study.`;
}

function isDuplicate(text) {
  const normalizedText = text.trim().toLowerCase();

  return notes.some(
    (note) => note.text.trim().toLowerCase() === normalizedText
  );
}

function addNote(text, category) {
  const trimmedText = text.trim();
  const validCategories = ["personal", "work", "study"];

  if (trimmedText.length < 1 || trimmedText.length > 200) {
    console.log("Note not added: text must be 1–200 characters.");
    return false;
  }

  if (isDuplicate(trimmedText)) {
    console.log("Note not added: duplicate note.");
    return false;
  }

  if (!validCategories.includes(category)) {
    console.log("Note not added: invalid category.");
    return false;
  }

  const newNote = {
    id: notes.length + 1,
    text: trimmedText,
    category: category,
  };

  notes.push(newNote);

  console.log("Note added successfully.");
  return true;
}

// searchNotes
console.log(searchNotes("day"));
// Expected: [{ id: 2, text: "Finish the Day 3 assignment", category: "study" }]

console.log(searchNotes("pizza"));
// Expected: []

// longestNote
console.log(longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }

const savedNotes = notes;
notes = [];
console.log(longestNote());
// Expected: null
notes = savedNotes;

// countByCategory
console.log(countByCategory());
// Expected: { personal: 2, study: 2, work: 1 }

console.log(countByCategory().personal);
// Expected: 2

// getSummary
console.log(getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."

console.log(notes.length === 5 ? getSummary() : "Unexpected note count");
// Expected: "5 notes: 2 personal, 1 work, 2 study."

// isDuplicate
console.log(isDuplicate("Buy milk and bread"));
// Expected: true

console.log(isDuplicate("  BUY MILK AND BREAD  "));
// Expected: true

console.log(isDuplicate("Buy eggs"));
// Expected: false

// addNote
console.log(addNote("Buy a new notebook", "personal"));
// Expected: true

console.log(addNote("Buy milk and bread", "personal"));
// Expected: false, because it is a duplicate

console.log(addNote("", "study"));
// Expected: false, because the text is empty

console.log(addNote("Learn JavaScript", "invalid"));
// Expected: false, because the category is invalid
