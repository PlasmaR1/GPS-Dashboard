import Navbar from "@/components/NavBar";
import BikesTable from "@/components/BikesTable";
import "mapbox-gl/dist/mapbox-gl.css";

export default function BikesPage() {
  return (
    <>
      <Navbar />
      <div className="pt-14"> {/* 留出 navbar 高度 */}
        <BikesTable />
      </div>
    </>
  );
}
