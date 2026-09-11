import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#4B2354] p-4">
      <SignUp
        routing="path"
        path="/store/sign-up"
        signInUrl="/store/sign-in"
        fallbackRedirectUrl="https://allibuild.com/dpstore/"
      />
    </div>
  );
}
