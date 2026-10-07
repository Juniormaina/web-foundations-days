# Library Books API

The Library Books API uses `books` as its main resource.

## Endpoints

### 1. List all books

- **Method:** `GET`
- **Path:** `/books`
- **Description:** Returns a list of all books.
- **Success:** `200 OK`

### 2. Get one book

- **Method:** `GET`
- **Path:** `/books/:id`
- **Description:** Returns a single book by its ID.
- **Success:** `200 OK`

### 3. Create a book

- **Method:** `POST`
- **Path:** `/books`
- **Description:** Creates a new book.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "publishedYear": 1958
}
```

- **Success:** `201 Created`

### 4. Update a book

- **Method:** `PUT`
- **Path:** `/books/:id`
- **Description:** Updates an existing book by its ID.
- **Example request body:**

```json
{
  "title": "Things Fall Apart",
  "author": "Chinua Achebe",
  "publishedYear": 1958
}
```

- **Success:** `200 OK`

### 5. Delete a book

- **Method:** `DELETE`
- **Path:** `/books/:id`
- **Description:** Deletes a book by its ID.
- **Success:** `204 No Content`

### 6. List books by author

- **Method:** `GET`
- **Path:** `/books?author=Chinua%20Achebe`
- **Description:** Returns books that match the `author` query parameter.
- **Success:** `200 OK`

## Error Codes

### 400 Bad Request

The request is invalid or missing required information.

Example:

```text
POST /books
```

with a request body that does not include a required `title`.

### 404 Not Found

The requested book does not exist.

Example:

```text
GET /books/9999
```

when book ID `9999` does not exist.
