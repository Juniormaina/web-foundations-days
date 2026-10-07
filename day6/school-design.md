# School Database Design

## Students

The `students` table stores information about each student. Each student has a unique ID, a name, and a unique email address. The email is required so that two students cannot use the same email address.

## Courses

The `courses` table stores the courses offered by the school. Each course has a unique ID and a required name.

## Enrolments

The `enrolments` table records which students are enrolled in which courses. It also stores the student's grade for that course. It contains foreign keys that connect each enrolment to a student and a course.

## Relationships

A student can have many enrolments, so the relationship between `students` and `enrolments` is one-to-many. A course can also have many enrolments, so the relationship between `courses` and `enrolments` is one-to-many.

Students and courses have a many-to-many relationship because one student can take many courses and one course can have many students. The `enrolments` table is needed as a join table to represent this many-to-many relationship. Each row connects one student to one course and can store additional information about that enrolment, such as the grade.

## Index

I would add an index on `enrolments.student_id` because queries that find all courses taken by a particular student will frequently use this column. An index can make those lookups faster as the number of enrolments grows.

## SQL or NoSQL?

I would choose SQL for this school system because the data has clear relationships between students, courses, and enrolments. A relational database makes it easy to enforce primary keys, foreign keys, unique emails, and rules that prevent duplicate enrolments. SQL also makes it straightforward to use joins and grouping to answer questions about students and courses. A NoSQL database could work, but SQL is a better fit for this structured and highly related data.
