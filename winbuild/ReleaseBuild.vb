Imports EnvDTE
Imports System.Diagnostics

Public Module ReleaseBuild
    Function GetProjectDir(ByVal FullName)
        Dim proj_path = Split(StrReverse(FullName), "\", -1, 1)
        Dim count
        count = UBound(proj_path)
        Dim full_path = ""

        Dim i
        For i = 1 To count

            full_path = full_path & "\" & proj_path(i)
        Next

        GetProjectDir = StrReverse(full_path)

    End Function

    Sub IncrementBuildNumber()
        Dim ps As System.Diagnostics.Process = New System.Diagnostics.Process
        Dim soln As Solution = DTE.Solution
        Dim full_path As String
        Dim version_path As String
        Dim appini_path As String
        Dim incrvpl As String

        MsgBox("Build Failed!!")
        full_path = GetProjectDir(soln.FullName)
        version_path = full_path + "..\src\version.hpp"
        appini_path = full_path + "..\src\xul_gui\application.ini"
        incrvpl = full_path + "..\src\perl\incr_version.pl"
        ps.StartInfo.FileName = "perl.exe"
        ps.StartInfo.Arguments = incrvpl + " " + version_path + " " + appini_path
        ps.Start()
    End Sub

    Sub BuildAllProj(ByVal config_name As String)
        'Build all projects
        Dim sb As SolutionBuild = DTE.Solution.SolutionBuild
        Dim cfg As SolutionConfiguration = sb.SolutionConfigurations.Item(config_name)
        For Each ctx As SolutionContext In cfg.SolutionContexts
            Debug.Print("project name:{0}", ctx.ProjectName)
            If ctx.ShouldBuild Then
                sb.BuildProject(config_name, ctx.ProjectName, True)
                If sb.LastBuildInfo() <> 0 Then
                    Exit Sub
                End If
            End If
         Next
    End Sub

    Sub TestBuild()
        Dim sb As SolutionBuild = DTE.Solution.SolutionBuild
        BuildAllProj("Release")
        If sb.LastBuildInfo() <> 0 Then
            MsgBox("Build Failed!!")
            Exit Sub
        End If
        sb.BuildProject("Release", "installer\installer.vcproj", True)
        ' sb.Debug()
    End Sub

    Sub ReleaseBuild()
        Dim sb As SolutionBuild = DTE.Solution.SolutionBuild
        BuildAllProj("Release")
        If sb.LastBuildInfo() <> 0 Then
            MsgBox("Build Failed!!")
            Exit Sub
        End If

        IncrementBuildNumber()

        BuildAllProj("Release")
        If sb.LastBuildInfo() <> 0 Then
            MsgBox("Build Failed!!")
            Exit Sub
        End If

        sb.BuildProject("Release", "installer\installer.vcproj", True)
    End Sub

End Module

