import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="state-box state-empty">
      <strong>Không tìm thấy trang</strong>
      <span>Đường dẫn không tồn tại hoặc bạn không có quyền truy cập.</span>
      <Link className="btn btn-primary" to="/">Về tổng quan</Link>
    </div>
  );
}
