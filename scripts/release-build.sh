#!/bin/sh
# MCEManager Linux release packaging script.
#
# Builds daemon + panel + frontend and packages the result into the same
# layout used by the one-click installer (install.sh):
#
#   mce_manager_linux_release.tar.gz          -> mcemanager/{daemon,web,start-*}
#
# The archive is modelled on the MCSManager release workflow
# (https://github.com/MCSManager/MCSManager/blob/master/.github/workflows/release.yml).

set -e

BASE_PATH=$(pwd)
RELEASE_NAME="mcemanager"
TARBALL_NAME="mce_manager_linux_release.tar.gz"

if [ ! -d "${BASE_PATH}/production-code" ]; then
  echo "production-code/ not found. Running the full build first..."
  chmod +x ./install-dependents.sh ./build.sh
  ./install-dependents.sh
  ./build.sh
fi

echo "Staging release files..."
rm -rf "${BASE_PATH}/staging" "${BASE_PATH}/${TARBALL_NAME}"
mkdir -p "${BASE_PATH}/staging/${RELEASE_NAME}"

cp -r "${BASE_PATH}/production-code/daemon" "${BASE_PATH}/staging/${RELEASE_NAME}/daemon"
cp -r "${BASE_PATH}/production-code/web" "${BASE_PATH}/staging/${RELEASE_NAME}/web"

# Startup scripts + license
cp -f "${BASE_PATH}/prod-scripts/linux/"* "${BASE_PATH}/staging/${RELEASE_NAME}/"
cp -f "${BASE_PATH}/LICENSE" "${BASE_PATH}/staging/${RELEASE_NAME}/LICENSE"

# Daemon helper binaries (zip/7z/ptty) from lib-urls.txt
mkdir -p "${BASE_PATH}/staging/${RELEASE_NAME}/daemon/lib"
if command -v wget >/dev/null 2>&1; then
  wget --input-file="${BASE_PATH}/lib-urls.txt" \
    --directory-prefix="${BASE_PATH}/staging/${RELEASE_NAME}/daemon/lib" || {
    echo "Warning: failed to download daemon helper binaries (build continues)."
  }
else
  echo "Warning: wget not available; skipping daemon helper binaries."
fi

echo "Creating ${TARBALL_NAME} ..."
tar -czf "${BASE_PATH}/${TARBALL_NAME}" -C "${BASE_PATH}/staging" "${RELEASE_NAME}"

rm -rf "${BASE_PATH}/staging"

echo "--------------------------------------------"
echo "Release ready: ${BASE_PATH}/${TARBALL_NAME}"
echo "Install with:  sudo su -c \"wget -qO- <url>/${TARBALL_NAME} | bash\""
echo "--------------------------------------------"
