import React from "react";
import { Link } from "react-router-dom";

const ApplicantRegister = () => {
  return (
    <div className="relative w-[1280px] h-[950px] bg-white font-montserrat">
      {/* Left Banner */}
      <div className="absolute top-0 left-0 w-[800px] h-full bg-[#1180DA]">
        <h1 className="absolute top-[280px] left-[121px] text-[48px] font-bold text-[#F5F5F5] leading-[48px]">
          Welcome<br />Applicant!
        </h1>
        <p className="absolute top-[400px] left-[121px] w-[436px] text-[16px] text-white">
          Sign up to apply for exciting opportunities and manage your job applications.
        </p>
      </div>

      {/* Logo that routes to homepage */}
      <Link to="/homepage">
        <div className="absolute top-[46px] left-[49px] text-[24px] font-bold cursor-pointer z-10">
          <span className="text-white">Isurf</span>
          <span className="text-black">HR</span>
        </div>
      </Link>

      {/* Heading */}
      <h2 className="absolute top-[164px] left-[1000px] text-[40px] font-bold text-black">Sign Up</h2>

      {/* Full Name */}
      <label className="absolute top-[239px] left-[1000px] text-[16px] text-black">Full Name</label>
      <input
        type="text"
        placeholder="Full Name"
        className="absolute top-[228px] left-[1000px] w-[314px] h-[44px] pl-4 placeholder-gray-500 border border-[#4D4545] rounded-[3px]"
      />

      {/* Email */}
      <label className="absolute top-[289px] left-[1000px] text-[16px] text-black">Email</label>
      <input
        type="email"
        placeholder="Email"
        className="absolute top-[278px] left-[1000px] w-[314px] h-[44px] pl-4 placeholder-gray-500 border border-[#4D4545] rounded-[3px]"
      />

      {/* Phone Number */}
      <label className="absolute top-[339px] left-[1000px] text-[16px] text-black">Phone Number</label>
      <input
        type="tel"
        placeholder="Phone Number"
        className="absolute top-[328px] left-[1000px] w-[314px] h-[44px] pl-4 placeholder-gray-500 border border-[#4D4545] rounded-[3px]"
      />

      {/* Password */}
      <label className="absolute top-[389px] left-[1000px] text-[16px] text-black">Password</label>
      <input
        type="password"
        placeholder="Password"
        className="absolute top-[378px] left-[1000px] w-[314px] h-[44px] pl-4 placeholder-gray-500 border border-[#4D4545] rounded-[3px]"
      />

      {/* Sign Up Button */}
      <button className="absolute top-[438px] left-[1000px] w-[314px] h-[52px] bg-[#1180DA] text-white rounded-[10px] text-[19px] font-bold">
        Sign Up
      </button>

      {/* Login Redirect */}
      <p className="absolute top-[508px] left-[1000px] text-[16px] text-black">
        Already have an account?{" "}
        <Link to="/login" className="text-[#1180DA] underline">Login</Link>
      </p>
    </div>
  );
};

export default ApplicantRegister;