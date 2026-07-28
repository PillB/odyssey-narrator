#!/bin/bash
# Translate all chapters one at a time (each in its own process for resilience)
SLUGS=(
  odyssey-book-01 odyssey-book-02 odyssey-book-03 odyssey-book-04 odyssey-book-05
  odyssey-book-06 odyssey-book-07 odyssey-book-08 odyssey-book-09 odyssey-book-10
  odyssey-book-11 odyssey-book-12 odyssey-book-13 odyssey-book-14 odyssey-book-15
  odyssey-book-16 odyssey-book-17 odyssey-book-18 odyssey-book-19 odyssey-book-20
  odyssey-book-21 odyssey-book-22 odyssey-book-23 odyssey-book-24
)

cd /home/z/my-project
for slug in "${SLUGS[@]}"; do
  echo "=== Translating $slug ==="
  # Run with a 5-minute timeout per chapter
  timeout 300 bun scripts/translate-one.ts "$slug" 2>&1
  EXIT=$?
  if [ $EXIT -eq 124 ]; then
    echo "=== $slug: TIMEOUT (5 min) ==="
  elif [ $EXIT -ne 0 ]; then
    echo "=== $slug: FAILED (exit $EXIT) ==="
  else
    echo "=== $slug: SUCCESS ==="
  fi
  # Brief pause between chapters
  sleep 2
done

echo ""
echo "=== TRANSLATION COMPLETE ==="
echo "Spanish files: $(ls /home/z/my-project/public/books/es/ 2>/dev/null | wc -l)/25"
