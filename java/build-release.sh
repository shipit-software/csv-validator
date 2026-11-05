
#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
    echo "Usage: sh java/build-release.sh OUTPUT_DIRECTORY" >&2
    exit 2
fi

module=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
repo=$(dirname -- "$module")
mkdir -- "$1"
output=$(CDPATH='' cd -- "$1" && pwd)
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
mkdir "$scratch/classes" "$scratch/docs" "$scratch/resources" "$scratch/test-classes"

source_dir="$module/src/main/java"
package_dir="$source_dir/com/shipitsoftware/csvvalidator"
fixture="$repo/rust/tests/fixtures/csv-v1.tsv"
artifact=csv-validator-0.1.0
timestamp=2026-11-06T00:00:00Z
entrypoint=com.shipitsoftware.csvvalidator.Main
export LC_ALL=C.UTF-8 TZ=UTC

cp "$repo/LICENSE" "$scratch/resources/LICENSE"
javac --release 17 -encoding UTF-8 -Xlint:all -Werror -d "$scratch/classes" "$package_dir"/*.java
javadoc -quiet -Werror -notimestamp --no-platform-links --release 17 -encoding UTF-8 \
    -d "$scratch/docs" "$package_dir"/*.java

jar --create --date "$timestamp" --file "$output/$artifact.jar" --main-class "$entrypoint" \
    -C "$scratch/classes" . -C "$scratch/resources" LICENSE
jar --create --date "$timestamp" --file "$output/$artifact-sources.jar" \
    -C "$source_dir" . -C "$scratch/resources" LICENSE
jar --create --date "$timestamp" --file "$output/$artifact-javadoc.jar" \
    -C "$scratch/docs" . -C "$scratch/resources" LICENSE
cp "$module/pom.xml" "$output/$artifact.pom"

javac --release 17 -encoding UTF-8 -Xlint:all -Werror -cp "$output/$artifact.jar" \
    -d "$scratch/test-classes" "$module/test/LibraryTest.java"
java -cp "$output/$artifact.jar:$scratch/test-classes" LibraryTest
python3 "$module/test/test_cli.py" "$output/$artifact.jar" "$fixture"
