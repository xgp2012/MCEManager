#!/bin/bash
# MCEManager official one-click installer.
# Installs / updates the MCEManager web panel and daemon components.
#
# Modelled on the MCSManager installer
# (https://script.mcsmanager.com/setup_cn.sh) with the MCEManager release
# layout and systemd service names (mcem-web / mcem-daemon).
#
# Supported Linux:
#   Ubuntu 18.04 / 20.04 / 22.04 / 24.04
#   Debian 10 / 11 / 12 / 13
#   CentOS 7 / 8 Stream / 9 Stream / 10 Stream
#   RHEL 7 / 8 / 9 / 10
#   Arch Linux (rolling)

# Target installation directory
install_dir="/opt/mcemanager"

# Release package
download_base_url="https://github.com/xgp2012/MCEManager/releases/latest/download/"
package_name="mce_manager_linux_release.tar.gz"
# Alternative download URL (or local path via --install-source)
download_fallback_url="${download_base_url}${package_name}"

# Node.js versions
node_version="v20.12.2"
node_version_centos7="v16.20.2"
node_download_url_base="https://nodejs.org/dist/"

# Install as root by default; --user mcsm switches to a system user
install_user="root"

systemd_file="/etc/systemd/system/mcem-"
install_source_path=""
force_permission=false

install_daemon=true
install_web=true
web_installed=false
daemon_installed=false
web_installed_user=""
daemon_installed_user=""

tmp_dir="/tmp"
install_tmp_dir=""
backup_prefix="data_bak_"

arch=""
distro=""
version=""
node_arch=""
node_path=""
node_bin_path=""
npm_bin_path=""
install_node=true
required_node_ver="${node_version#v}"

daemon_key=""
daemon_port=""
web_port=""

SUPPORTS_COLOR=false
RESET="\033[0m"
declare -A FG_COLORS=(
  [red]="\033[0;31m" [green]="\033[0;32m" [yellow]="\033[0;33m"
  [cyan]="\033[0;36m" [white]="\033[0;37m"
)

cprint() {
  local color="" text="" styles=""
  while [[ $# -gt 1 ]]; do
    case "$1" in
      red|green|yellow|cyan|white) color="$1"; shift ;;
      bold) styles="\033[1m"; shift ;;
      *) break ;;
    esac
  done
  text="$1"
  local prefix=""
  [[ -n "$color" && "$SUPPORTS_COLOR" = true ]] && prefix="${FG_COLORS[$color]}"
  printf "%b%s%b\n" "${prefix}${styles}" "$text" "$RESET"
}

safe_run() { if ! "$1" "${@:2}"; then echo "Error: $2"; exit 1; fi; }

check_root() {
  if [ "$(id -u)" -ne 0 ]; then
    cprint red bold "错误: 此脚本只能以 root 或 sudo 模式运行。"
    exit 1
  fi
}

detect_terminal_capabilities() {
  if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
    [ "$(tput colors)" -ge 8 ] && SUPPORTS_COLOR=true
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --install-dir)
        [[ -n "$2" ]] && { install_dir="$2"; shift 2; } || { echo "错误：--install-dir 需要路径参数"; exit 1; };;
      --install)
        case "$2" in
          web) install_daemon=false; install_web=true ;;
          daemon) install_daemon=true; install_web=false ;;
          all) install_daemon=true; install_web=true ;;
          *) echo "错误：--install 需要 web|daemon|all"; exit 1 ;;
        esac
        shift 2;;
      --user)
        case "$2" in
          root|mcsm) install_user="$2"; shift 2 ;;
          *) echo "错误：--user 需要 root|mcsm"; exit 1 ;;
        esac;;
      --install-source)
        [[ -n "$2" ]] && { install_source_path="$2"; shift 2; } || { echo "错误：--install-source 需要文件路径"; exit 1; };;
      --force-permission)
        force_permission=true; shift;;
      *)
        echo "错误：未知参数 $1"; exit 1;;
    esac
  done
}

is_component_installed() {
  local component="$1"
  if [[ -d "$install_dir/$component" ]]; then
    cprint green "组件 '$component' 已安装于 $install_dir/$component"
    if [[ "$component" == "daemon" ]]; then daemon_installed=true; else web_installed=true; fi
    return 0
  fi
  cprint yellow "组件 '$component' 未安装"
  if [[ "$component" == "daemon" ]]; then daemon_installed=false; else web_installed=false; fi
  return 1
}

check_component_permission() {
  local component="$1" service_file="${systemd_file}${component}.service"
  [[ ! -f "$service_file" ]] && return 0
  local user
  user=$(grep -E '^User=' "$service_file" 2>/dev/null | head -1 | sed 's/^User=//')
  [[ -z "$user" ]] && user="root"
  if [[ "$user" != "root" && "$user" != "mcsm" ]]; then
    cprint red bold "不支持的用户 '$user' 于 $service_file。请使用 root 或 mcsm。"
    exit 1
  fi
  if [[ "$component" == "web" ]]; then web_installed_user="$user"; else daemon_installed_user="$user"; fi
  cprint cyan "检测到 $component 以用户 '$user' 安装"
}

detect_os_info() {
  arch=$(uname -m)
  distro="Unknown"; version=""
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "${ID,,}" in
      ubuntu) distro="Ubuntu" ;;
      debian) distro="Debian" ;;
      centos) distro="CentOS" ;;
      rhel*) distro="RHEL" ;;
      arch) distro="Arch"; version="rolling" ;;
      *) distro="${ID:-Unknown}" ;;
    esac
    [[ -z "$version" ]] && version="$VERSION_ID"
  fi
  [[ -z "$version" || "$version" == "unknown" ]] && version=$(grep -oP '[0-9]+(\.[0-9]+)*' /etc/issue 2>/dev/null | head -1)
  cprint cyan "检测到操作系统: $distro $version  架构: $arch"
  if [[ "$distro" == "CentOS" && "$version" == "7" ]]; then
    node_version="$node_version_centos7"; required_node_ver="${node_version#v}"
    cprint yellow "检测到 CentOS 7，Node.js 版本切换为 $node_version"
  fi
}

resolve_node_arch() {
  case "$arch" in
    x86_64) node_arch="x64" ;;
    aarch64) node_arch="arm64" ;;
    armv7l) node_arch="armv7l" ;;
    loongarch64) node_arch="loong64"; node_download_url_base="https://unofficial-builds.nodejs.org/download/release/" ;;
    *) cprint red bold "不支持的架构: $arch"; return 1 ;;
  esac
  node_path="${install_dir}/node-${node_version}-linux-${node_arch}"
  cprint cyan "Node.js 架构: $node_arch 安装路径: $node_path"
}

check_required_commands() {
  local missing=0
  for cmd in chmod chown wget tar stat useradd usermod date; do
    command -v "$cmd" >/dev/null 2>&1 || { echo "缺少必需命令: $cmd"; missing=1; }
  done
  [[ $missing -eq 1 ]] && { echo "请安装缺失命令后再试"; return 1; }
  cprint green "所有必需命令均可用"
}

verify_node_at_path() {
  local np="$1"
  node_bin_path="$np/bin/node"; npm_bin_path="$np/bin/npm"
  [[ ! -x "$node_bin_path" ]] && return 1
  local installed_ver
  installed_ver=$("$node_bin_path" -v 2>/dev/null | sed 's/^v//')
  [[ -z "$installed_ver" ]] && return 1
  [[ "$installed_ver" != "$required_node_ver" ]] && return 3
  [[ ! -x "$npm_bin_path" ]] && return 4
  "$node_bin_path" "$npm_bin_path" --version >/dev/null 2>&1 || return 4
  return 0
}

check_node_installed() {
  verify_node_at_path "$node_path"; local r=$?
  case $r in
    0) cprint green "Node.js 可用 ($required_node_ver)"; install_node=false ;;
    1) cprint yellow "未找到 Node.js，将安装"; install_node=true ;;
    3) cprint red "Node.js 版本不匹配 (需要 $required_node_ver)，将重新安装"; install_node=true ;;
    4) cprint red "Node.js 存在但 npm 缺失/损坏，将重新安装"; install_node=true ;;
  esac
}

install_node() {
  local archive_name="node-${node_version}-linux-${node_arch}.tar.xz"
  local target_dir="${install_dir}/node-${node_version}-linux-${node_arch}"
  local archive_path="${install_dir}/${archive_name}"
  local download_url="${node_download_url_base}${node_version}/${archive_name}"

  cprint cyan "安装 Node.js $node_version ..."
  mkdir -p "$install_dir"
  if ! wget --progress=bar:force -O "$archive_path" "$download_url"; then
    cprint red bold "Node.js 下载失败: $download_url"
    return 1
  fi
  if ! tar -xf "$archive_path" -C "$install_dir"; then
    cprint red bold "Node.js 解压失败"; return 1
  fi
  chmod -R a+rx "$target_dir"
  rm -f "$archive_path"
  verify_node_at_path "$target_dir" || { cprint red bold "Node.js 安装验证失败"; return 1; }
  cprint green "Node.js $node_version 安装完成: $target_dir"
  return 0
}

download_mcsm() {
  local archive_path="${tmp_dir}/${package_name}"
  local target_path="${install_dir}/${package_name}"

  if [[ -n "$install_source_path" ]]; then
    if [[ ! -f "$install_source_path" ]]; then
      cprint red bold "本地发布包不存在: $install_source_path"; return 1
    fi
    cp "$install_source_path" "$archive_path" || return 1
    cprint cyan "使用本地发布包: $install_source_path"
  else
    cprint cyan "下载发布包: ${download_base_url}${package_name}"
    if ! wget --progress=bar:force -O "$archive_path" "${download_base_url}${package_name}"; then
      cprint yellow "主源下载失败，尝试备用源..."
      if ! wget --progress=bar:force -O "$archive_path" "$download_fallback_url"; then
        cprint red bold "发布包下载失败，请检查网络或改用 --install-source"
        return 1
      fi
    fi
  fi

  local suffix
  suffix=$(tr -dc 'a-z0-9' </dev/urandom | head -c 4)
  install_tmp_dir="${install_dir}/mce_${suffix}"
  mkdir -p "$install_tmp_dir"
  if ! tar -xzf "$archive_path" -C "$install_tmp_dir"; then
    cprint red bold "发布包解压失败"; rm -rf "$install_tmp_dir"; return 1
  fi
  rm -f "$archive_path"
  cprint green "发布包已解压到 $install_tmp_dir"
  return 0
}

prepare_user() {
  if [[ "$install_user" == "root" ]]; then
    cprint cyan "安装用户为 root，跳过用户创建"
    return 0
  fi
  if ! id "$install_user" &>/dev/null; then
    cprint cyan "创建系统用户: $install_user"
    useradd --system --home "$install_dir" --shell /usr/sbin/nologin "$install_user" || exit 1
  fi
  if command -v docker &>/dev/null && getent group docker &>/dev/null; then
    if ! id -nG "$install_user" | grep -qw docker; then
      cprint cyan "将 $install_user 加入 docker 组"
      usermod -aG docker "$install_user" 2>/dev/null || true
    fi
  fi
}

stop_mcsm_services() {
  for svc in mcem-web mcem-daemon; do
    cprint cyan "停止 $svc ..."
    systemctl stop "$svc" 2>/dev/null || true
  done
}

permission_barrier() {
  if [[ "$web_installed" == false && "$daemon_installed" == false ]]; then
    cprint cyan "未检测到已安装组件，跳过权限检查"
    return 0
  fi
  for component in web daemon; do
    local is_installed_var="${component}_installed" user_var="${component}_installed_user"
    [[ "${!is_installed_var}" == false ]] && continue
    local installed_user="${!user_var}"
    [[ -z "$installed_user" ]] && installed_user="root"
    if [[ "$installed_user" != "$install_user" ]]; then
      if [[ "$force_permission" == true ]]; then
        cprint yellow "组件 $component 用户不匹配 ($installed_user vs $install_user)，强制继续"
      else
        cprint red bold "组件 $component 用户不匹配 ($installed_user vs $install_user)"
        cprint red "请使用相同用户运行，或添加 --force-permission"
        exit 1
      fi
    fi
  done
  cprint green "权限检查通过"
}

install_component() {
  local component="$1"
  local target_path="${install_dir}/${component}"
  local source_path="${install_tmp_dir}/mcemanager/${component}"

  cprint cyan "安装/更新组件: $component"
  if [[ ! -d "$source_path" ]]; then
    cprint red bold "找不到源目录: $source_path"
    return 1
  fi

  # Preserve data directory across updates
  local data_dir="$target_path/data"
  local backup_dir="${install_dir}/${backup_prefix}${component}"
  if [[ -d "$data_dir" ]]; then
    rm -rf "$backup_dir"
    cp -a "$data_dir" "$backup_dir"
    cprint cyan "已备份数据目录 -> $backup_dir"
  fi

  rm -rf "$target_path/node_modules"
  mkdir -p "$target_path"
  cp -a "$source_path"/. "$target_path"

  if [[ -d "$backup_dir" ]]; then
    rm -rf "$data_dir"
    mkdir -p "$(dirname "$data_dir")"
    cp -a "$backup_dir" "$data_dir"
    rm -rf "$backup_dir"
  fi

  cprint cyan "安装依赖库: $component ..."
  pushd "$target_path" >/dev/null || return 1
  if ! "$node_bin_path" "$npm_bin_path" install --registry=https://registry.npmmirror.com --no-audit --no-fund --loglevel=warn; then
    popd >/dev/null; cprint red bold "依赖安装失败: $component"; return 1
  fi
  popd >/dev/null
  cprint green "组件 '$component' 安装完成"
  return 0
}

create_systemd_service() {
  local component="$1" service_path="${systemd_file}${component}.service"
  local working_dir="${install_dir}/${component}"
  local exec="${node_bin_path} app.js"

  cprint cyan "创建 systemd 服务 $component ..."
  cat > "$service_path" <<EOF
[Unit]
Description=MCEManager-${component^}
After=network.target

[Service]
Type=simple
WorkingDirectory=${working_dir}
ExecStart=${exec}
ExecReload=/bin/kill -s HUP \$MAINPID
ExecStop=/bin/kill -s TERM \$MAINPID
Restart=on-failure
User=${install_user}
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
EOF
  chmod 644 "$service_path"
  cprint green "已创建: $service_path"
}

extract_component_info() {
  if [[ "$install_daemon" == true ]]; then
    if systemctl restart mcem-daemon 2>/dev/null; then
      sleep 3
      local cfg="${install_dir}/daemon/data/Config/global.json"
      [[ -f "$cfg" ]] && {
        daemon_key=$(grep -oP '"key"\s*:\s*"\K[^"]+' "$cfg")
        daemon_port=$(grep -oP '"port"\s*:\s*\K[0-9]+' "$cfg")
      }
    fi
  fi
  if [[ "$install_web" == true ]]; then
    if systemctl restart mcem-web 2>/dev/null; then
      sleep 3
      local cfg="${install_dir}/web/data/SystemConfig/config.json"
      [[ -f "$cfg" ]] && web_port=$(grep -oP '"httpPort"\s*:\s*\K[0-9]+' "$cfg")
    fi
  fi
}

cleanup_install_tmp() {
  [[ -n "$install_tmp_dir" && -d "$install_tmp_dir" ]] && rm -rf "$install_tmp_dir"
}

print_install_result() {
  clear 2>/dev/null || true
  cprint white "=================================================="
  cprint green "MCEManager 安装/更新完成"
  cprint white "=================================================="

  local ip_address
  ip_address=$(hostname -I 2>/dev/null | awk '{print $1}')
  [[ -z "$ip_address" ]] && ip_address="你的IP"

  if [[ "$install_daemon" == true ]]; then
    cprint yellow "节点地址:"
    cprint white "  ws://$ip_address:${daemon_port:-(读取配置失败)}"
    cprint yellow "节点密钥:"
    cprint white "  ${daemon_key:-(读取配置失败)}"
    echo ""
  fi

  if [[ "$install_web" == true ]]; then
    cprint yellow "面板地址:"
    cprint white "  http://$ip_address:${web_port:-23333}"
    echo ""
  fi

  cprint yellow "管理命令:"
  for comp in daemon web; do
    [[ "$install_$comp" == false ]] && continue
    cprint white "  systemctl start|stop|restart|status mcem-$comp.service"
  done
  echo ""

  cprint yellow "注意: 请确保防火墙放行上述端口。"
  cprint yellow "如需 HTTPS，请配置反向代理。"
  cprint green "安装完成，enjoy MCEManager!"
}

install_mcsm() {
  local components=()
  [[ "$install_web" == true ]] && { install_component "web" && create_systemd_service "web" && components+=("web"); }
  [[ "$install_daemon" == true ]] && { install_component "daemon" && create_systemd_service "daemon" && components+=("daemon"); }

  if (( ${#components[@]} > 0 )); then
    systemctl daemon-reload
    for comp in "${components[@]}"; do
      cprint cyan "启用服务 mcem-$comp ..."
      systemctl enable "mcem-${comp}.service" &>/dev/null || { cprint red bold "启用服务失败"; cleanup_install_tmp; exit 1; }
    done
  fi

  cleanup_install_tmp
  safe_run extract_component_info "读取运行时信息失败"
  safe_run print_install_result "打印安装结果失败"
}

main() {
  trap 'echo "发生意外错误"; exit 99' ERR
  safe_run detect_terminal_capabilities "终端检测失败"
  safe_run check_root "脚本必须以 root 运行"
  safe_run parse_args "解析参数失败" "$@"
  safe_run detect_os_info "系统检测失败"
  safe_run resolve_node_arch "解析 Node.js 架构失败"
  safe_run check_required_commands "缺少系统命令"

  is_component_installed "daemon" && check_component_permission "daemon"
  is_component_installed "web" && check_component_permission "web"

  safe_run permission_barrier "权限检查失败"
  safe_run check_node_installed "Node.js 检测失败"
  if [[ "$install_node" == true ]]; then
    safe_run install_node "Node.js 安装失败"
  fi
  safe_run prepare_user "用户准备失败"
  safe_run download_mcsm "发布包获取失败"
  safe_run stop_mcsm_services "停止旧服务失败"
  safe_run install_mcsm "安装失败"
}
main "$@"
